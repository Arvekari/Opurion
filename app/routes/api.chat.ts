import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { generateId } from 'ai';
import { MAX_RESPONSE_SEGMENTS, MAX_TOKENS, type FileMap } from '~/lib/.server/llm/constants';
import { CONTINUE_PROMPT } from '~/lib/common/prompts/prompts';
import { streamText, type Messages } from '~/lib/.server/llm/stream-text';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';
import type { IProviderSetting } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';
import { getFilePaths, selectContext } from '~/lib/.server/llm/select-context';
import type { ContextAnnotation, ProgressAnnotation } from '~/types/context';
import { WORK_DIR } from '~/utils/constants';
import { createSummary } from '~/lib/.server/llm/create-summary';
import { extractPropertiesFromMessage } from '~/lib/.server/llm/utils';
import type { DesignScheme } from '~/types/design-scheme';
import { MCPService } from '~/lib/services/mcpService';
import { StreamRecoveryManager } from '~/lib/.server/llm/stream-recovery';
import { resolveApiKeys, resolveCustomPrompt, resolveProviderSettings } from '~/lib/api/cookies';
import { AgentRunService } from '~/lib/.server/agents/agentRunService';
import { processMcpMessagesForRequest } from '~/integrations/mcp/adapter';
import { getRequestId } from '~/platform/http/request-context';
import { createDataStream, writeStreamPartToDataStream, type DataStreamWriter } from '~/lib/.server/llm/data-stream';
import {
  synthesizeMissingFileArtifactForStartOnlyOutput,
  shouldNormalizeOllamaBuildMode,
  shouldRetryOllamaBuildNarrative,
  synthesizePreviewStartActionForExistingArtifacts,
  synthesizeBoltArtifactFromContent,
  synthesizeMissingProjectEssentialsForExistingArtifacts,
} from '~/lib/.server/llm/ollama-response-normalization';

export async function action(args: ActionFunctionArgs) {
  return chatAction(args);
}

const logger = createScopedLogger('api.chat');

function toLogPreview(content: string, maxChars = 1200): string {
  const normalized = content.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars)}…[truncated]`;
}

function extractModelSizeInBillions(modelName?: string): number | undefined {
  if (!modelName) {
    return undefined;
  }

  const match = modelName.match(/(\d+(?:\.\d+)?)\s*b\b/i);

  if (!match) {
    return undefined;
  }

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getOllamaRecoveryRoundLimit(params: {
  providerName?: string;
  chatMode: 'discuss' | 'build';
  ollamaBridgedSystemPromptSplit?: boolean;
  modelName?: string;
}): number {
  if (!shouldNormalizeOllamaBuildMode({ chatMode: params.chatMode, providerName: params.providerName })) {
    return 1;
  }

  const modelSizeB = extractModelSizeInBillions(params.modelName);
  const splitModeActive = params.ollamaBridgedSystemPromptSplit !== true;

  if (!splitModeActive) {
    return 1;
  }

  if (modelSizeB !== undefined && modelSizeB <= 8) {
    return 6;
  }

  if (modelSizeB !== undefined && modelSizeB <= 16) {
    return 5;
  }

  if (modelSizeB === undefined) {
    return 4;
  }

  return 3;
}

type BuildOutputParts = {
  normalizedArtifact?: string;
  missingFileArtifact?: string;
  previewStartAction?: string;
  missingProjectEssentials?: string;
  passThroughText?: string;
};

function normalizePathLikeValue(value: string): string {
  const trimmed = value.trim().replace(/^['"`]|['"`]$/g, '');

  if (!trimmed || trimmed.includes('://')) {
    return '';
  }

  const normalized = trimmed.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');

  if (!normalized || normalized === '.' || normalized === '/') {
    return '';
  }

  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function extractRequestedFilePaths(requestContent: string): string[] {
  if (!requestContent?.trim()) {
    return [];
  }

  const matches = new Set<string>();
  const text = requestContent;
  const pushMatch = (candidate: string) => {
    const normalized = normalizePathLikeValue(candidate);

    if (!normalized || !/[.][a-z0-9]{1,10}$/i.test(normalized)) {
      return;
    }

    matches.add(normalized.toLowerCase());
  };

  for (const match of text.matchAll(/`([^`\n]+\.[a-z0-9]{1,10})`/gi)) {
    if (match[1]) {
      pushMatch(match[1]);
    }
  }

  for (const match of text.matchAll(/\b(?:create|add|write|update|modify|edit|implement)\s+(?:a\s+|an\s+|the\s+)?(?:file\s+)?(?:named\s+)?([/\w.-]+\.[a-z0-9]{1,10})\b/gi)) {
    if (match[1]) {
      pushMatch(match[1]);
    }
  }

  for (const match of text.matchAll(/(?:^|\s)([/\w.-]+\.[a-z0-9]{1,10})(?=\s|$)/gi)) {
    if (match[1]) {
      pushMatch(match[1]);
    }
  }

  return Array.from(matches);
}

function extractOutputFilePaths(content: string): Set<string> {
  const outputPaths = new Set<string>();

  for (const match of content.matchAll(/<boltAction\s+type="file"[^>]*filePath="([^"]+)"/gi)) {
    if (match[1]) {
      const normalized = normalizePathLikeValue(match[1]);

      if (normalized) {
        outputPaths.add(normalized.toLowerCase());
      }
    }
  }

  return outputPaths;
}

function getMissingRequestedFilePaths(requestedPaths: string[], outputContent: string): string[] {
  if (requestedPaths.length === 0) {
    return [];
  }

  const outputPaths = extractOutputFilePaths(outputContent);

  return requestedPaths.filter((requestedPath) => {
    const normalizedRequested = normalizePathLikeValue(requestedPath).toLowerCase();

    if (!normalizedRequested) {
      return false;
    }

    if (outputPaths.has(normalizedRequested)) {
      return false;
    }

    const requestedBasename = normalizedRequested.split('/').pop();

    if (!requestedBasename) {
      return true;
    }

    for (const outputPath of outputPaths) {
      if (outputPath.endsWith(`/${requestedBasename}`) || outputPath === `/${requestedBasename}`) {
        return false;
      }
    }

    return true;
  });
}

function buildOutputSnapshot(parts: BuildOutputParts, rawText: string): string {
  return [
    parts.normalizedArtifact,
    parts.missingFileArtifact,
    parts.previewStartAction,
    parts.missingProjectEssentials,
    parts.passThroughText,
    rawText,
  ]
    .filter((segment): segment is string => typeof segment === 'string' && segment.trim().length > 0)
    .join('\n');
}

function hasExecutableFileAction(content: string): boolean {
  return /<boltAction\s+type="file"[^>]*filePath="[^"]+"/i.test(content);
}

function isTrivialViteHtmlShell(content: string): boolean {
  const trimmed = content.trim();

  if (!/<!doctype html>|<html[\s>]/i.test(trimmed)) {
    return false;
  }

  return /<div\s+id=["']root["']\s*><\/div>/i.test(trimmed) && /<script[^>]+src=["']\/src\/main\.(?:tsx|jsx|ts|js)["'][^>]*><\/script>/i.test(trimmed);
}

function extractExecutableBoltArtifacts(content: string): string | undefined {
  const matches = Array.from(content.matchAll(/<boltArtifact\b[\s\S]*?<\/boltArtifact>/gi)).map((match) => match[0].trim());

  if (matches.length === 0) {
    return undefined;
  }

  return `\n${matches.join('\n')}\n`;
}

function getBuildOutputToPassThrough(content: string): string | undefined {
  const trimmed = content.trim();

  if (!trimmed) {
    return undefined;
  }

  const artifactBlocks = extractExecutableBoltArtifacts(trimmed);

  if (artifactBlocks) {
    return artifactBlocks;
  }

  if (/<!doctype html>|<html[\s>]/i.test(trimmed) && !isTrivialViteHtmlShell(trimmed)) {
    return trimmed;
  }

  if (/```(?:html|tsx|jsx|ts|js|py|php|json)\b[\s\S]*```/i.test(trimmed)) {
    return trimmed;
  }

  return undefined;
}

function collectBuildOutputParts(content: string, fallbackNarrative?: string): BuildOutputParts {
  const normalizedArtifact = synthesizeBoltArtifactFromContent(content);
  const artifactSource = normalizedArtifact || extractExecutableBoltArtifacts(content) || content;

  return {
    normalizedArtifact,
    missingFileArtifact: synthesizeMissingFileArtifactForStartOnlyOutput({
      content,
      fallbackNarrative,
    }),
    previewStartAction: synthesizePreviewStartActionForExistingArtifacts(artifactSource),
    missingProjectEssentials: synthesizeMissingProjectEssentialsForExistingArtifacts(artifactSource),
    passThroughText: getBuildOutputToPassThrough(content),
  };
}

function hasAssembledExecutableBuildOutput(parts: BuildOutputParts): boolean {
  return Boolean(
    parts.normalizedArtifact ||
      parts.missingFileArtifact ||
      parts.previewStartAction ||
      parts.missingProjectEssentials ||
      parts.passThroughText,
  );
}

function writeAssembledBuildOutput(parts: BuildOutputParts, dataStream: DataStreamWriter): void {
  if (parts.normalizedArtifact) {
    writeStreamPartToDataStream({ type: 'text-delta', text: parts.normalizedArtifact }, dataStream);
  }

  if (parts.missingFileArtifact) {
    writeStreamPartToDataStream({ type: 'text-delta', text: parts.missingFileArtifact }, dataStream);
  }

  if (parts.previewStartAction) {
    writeStreamPartToDataStream({ type: 'text-delta', text: parts.previewStartAction }, dataStream);
  }

  if (parts.missingProjectEssentials) {
    writeStreamPartToDataStream({ type: 'text-delta', text: parts.missingProjectEssentials }, dataStream);
  }

  if (parts.passThroughText && !parts.normalizedArtifact) {
    writeStreamPartToDataStream({ type: 'text-delta', text: parts.passThroughText }, dataStream);
  }
}

function isBuildOutputSafeToPassThrough(content: string): boolean {
  return Boolean(getBuildOutputToPassThrough(content) || hasExecutableFileAction(content.trim()));
}

async function chatAction({ context, request }: ActionFunctionArgs) {
  const streamRecovery = new StreamRecoveryManager({
    timeout: 45000,
    maxRetries: 2,
    onTimeout: () => {
      logger.warn('Stream timeout - attempting recovery');
    },
  });

  const {
    messages,
    files,
    promptId,
    contextOptimization,
    supabase,
    chatMode,
    designScheme,
    maxLLMSteps,
    ollamaBridgedSystemPromptSplit,
    clientRequestId,
  } =
    await request.json<{
      messages: Messages;
      files: any;
      promptId?: string;
      contextOptimization: boolean;
      chatMode: 'discuss' | 'build';
      designScheme?: DesignScheme;
      ollamaBridgedSystemPromptSplit?: boolean;
      clientRequestId?: string;
      supabase?: {
        isConnected: boolean;
        hasSelectedProject: boolean;
        credentials?: {
          anonKey?: string;
          supabaseUrl?: string;
        };
        developmentPostgres?: {
          enabled: boolean;
          host?: string;
          port?: string;
          database?: string;
          username?: string;
          ssl?: boolean;
          hasPassword?: boolean;
        };
        postgrest?: {
          enabled: boolean;
          endpoint?: string;
          schema?: string;
          hasApiKey?: boolean;
        };
      };
      maxLLMSteps: number;
    }>();

  const resolvedClientRequestId =
    clientRequestId || request.headers.get('X-Client-Request-Id') || request.headers.get('x-client-request-id') || undefined;

  const latestUserMessage = messages.filter((message) => message.role === 'user').slice(-1)[0];
  const requestModelInfo = latestUserMessage ? extractPropertiesFromMessage(latestUserMessage) : { model: undefined, provider: undefined };
  const requestedFileTargets = extractRequestedFilePaths(latestUserMessage?.content || '');

  logger.info('Chat request received', {
    requestId: getRequestId(request),
    clientRequestId: resolvedClientRequestId,
    chatMode,
    promptId: promptId || 'default',
    messageCount: messages.length,
    model: requestModelInfo.model,
    provider: requestModelInfo.provider,
    contextOptimization,
  });

  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = await resolveApiKeys(cookieHeader, context.cloudflare?.env as any);
  const providerSettings: Record<string, IProviderSetting> = await resolveProviderSettings(
    cookieHeader,
    context.cloudflare?.env as any,
  );
  const customPrompt = await resolveCustomPrompt(cookieHeader, context.cloudflare?.env as any);

  const stream = new SwitchableStream();

  const cumulativeUsage = {
    completionTokens: 0,
    promptTokens: 0,
    totalTokens: 0,
  };
  const encoder: TextEncoder = new TextEncoder();
  let progressCounter: number = 1;
  const agentRunService = AgentRunService.getInstance();
  const agentRun = agentRunService.createRun({
    request: {
      system: 'chat-agent',
      message: messages.at(-1)?.content || '',
      model: 'chat',
      provider: 'chat',
    },
    engine: 'workflow',
    timeoutMs: 120000,
    metadata: { chatMode },
  });

  try {
    const mcpService = MCPService.getInstance();
    const totalMessageContent = messages.reduce((acc, message) => acc + message.content, '');
    logger.debug(`Total message length: ${totalMessageContent.split(' ').length}, words`);

    const dataStream = createDataStream({
      async execute(dataStream: DataStreamWriter) {
        const emitAgentRun = () => {
          const currentRun = agentRunService.getRun(agentRun.runId);

          if (!currentRun) {
            return;
          }

          const safeSteps: Array<{ id: string; label: string; state: string }> = Array.isArray(
            (currentRun as any).steps,
          )
            ? (currentRun as any).steps
            : [];

          dataStream.writeData({
            type: 'agentRun',
            run: {
              runId: currentRun.runId,
              state: currentRun.state,
              steps: safeSteps.map((step) => ({
                id: step.id,
                label: step.label,
                state: step.state,
              })),
              error: currentRun.error,
            },
          } as any);
        };

        emitAgentRun();
        streamRecovery.startMonitoring();

        const filePaths = getFilePaths(files || {});
        let filteredFiles: FileMap | undefined = undefined;
        let summary: string | undefined = undefined;
        let messageSliceId = 0;

        const processedMessages = await processMcpMessagesForRequest({
          requestId: getRequestId(request),
          messages,
          dataStream,
        });
        const planStepId = agentRunService.beginStep(agentRun.runId, 'plan', 'Plan request and select context');
        emitAgentRun();

        if (processedMessages.length > 3) {
          messageSliceId = processedMessages.length - 3;
        }

        if (filePaths.length > 0 && contextOptimization) {
          logger.debug('Generating Chat Summary');
          dataStream.writeData({
            type: 'progress',
            label: 'summary',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Analysing Request',
          } satisfies ProgressAnnotation);

          // Create a summary of the chat
          console.log(`Messages count: ${processedMessages.length}`);

          summary = await createSummary({
            messages: [...processedMessages],
            env: context.cloudflare?.env,
            apiKeys,
            providerSettings,
            promptId,
            contextOptimization,
            onFinish(resp) {
              if (resp.usage) {
                logger.debug('createSummary token usage', JSON.stringify(resp.usage));

                const usage: any = resp.usage;
                cumulativeUsage.completionTokens += usage.completionTokens || usage.outputTokens || 0;
                cumulativeUsage.promptTokens += usage.promptTokens || usage.inputTokens || 0;
                cumulativeUsage.totalTokens += usage.totalTokens || 0;
              }
            },
          });
          dataStream.writeData({
            type: 'progress',
            label: 'summary',
            status: 'complete',
            order: progressCounter++,
            message: 'Analysis Complete',
          } satisfies ProgressAnnotation);

          dataStream.writeMessageAnnotation({
            type: 'chatSummary',
            summary,
            chatId: processedMessages.slice(-1)?.[0]?.id,
          } as ContextAnnotation);

          // Update context buffer
          logger.debug('Updating Context Buffer');
          dataStream.writeData({
            type: 'progress',
            label: 'context',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Determining Files to Read',
          } satisfies ProgressAnnotation);

          // Select context files
          console.log(`Messages count: ${processedMessages.length}`);
          filteredFiles = await selectContext({
            messages: [...processedMessages],
            env: context.cloudflare?.env,
            apiKeys,
            files,
            providerSettings,
            promptId,
            contextOptimization,
            summary,
            onFinish(resp) {
              if (resp.usage) {
                logger.debug('selectContext token usage', JSON.stringify(resp.usage));

                const usage: any = resp.usage;
                cumulativeUsage.completionTokens += usage.completionTokens || usage.outputTokens || 0;
                cumulativeUsage.promptTokens += usage.promptTokens || usage.inputTokens || 0;
                cumulativeUsage.totalTokens += usage.totalTokens || 0;
              }
            },
          });

          if (filteredFiles) {
            logger.debug(`files in context : ${JSON.stringify(Object.keys(filteredFiles))}`);
          }

          dataStream.writeMessageAnnotation({
            type: 'codeContext',
            files: Object.keys(filteredFiles).map((key) => {
              let path = key;

              if (path.startsWith(WORK_DIR)) {
                path = path.replace(WORK_DIR, '');
              }

              return path;
            }),
          } as ContextAnnotation);

          dataStream.writeData({
            type: 'progress',
            label: 'context',
            status: 'complete',
            order: progressCounter++,
            message: 'Code Files Selected',
          } satisfies ProgressAnnotation);

          // logger.debug('Code Files Selected');
        }

        agentRunService.completeStep(agentRun.runId, planStepId, 'Planning complete');
        emitAgentRun();

        const executeStepId = agentRunService.beginStep(agentRun.runId, 'execute', 'Execute LLM run');
        emitAgentRun();

        const options: any = {
          supabaseConnection: supabase,
          toolChoice: 'auto',
          tools: mcpService.toolsWithoutExecute,
          maxSteps: maxLLMSteps,
          onStepFinish: ({ toolCalls }: any) => {
            // add tool call annotations for frontend processing
            (toolCalls || []).forEach((toolCall: any) => {
              mcpService.processToolCall(toolCall, dataStream);
            });
          },
          onFinish: async ({ text: content, finishReason, usage }: any) => {
            logger.debug('usage', JSON.stringify(usage));

            if (usage) {
              const usageAny: any = usage;
              cumulativeUsage.completionTokens += usageAny.completionTokens || usageAny.outputTokens || 0;
              cumulativeUsage.promptTokens += usageAny.promptTokens || usageAny.inputTokens || 0;
              cumulativeUsage.totalTokens += usageAny.totalTokens || 0;
            }

            if (finishReason !== 'length') {
              agentRunService.completeStep(agentRun.runId, executeStepId, content.slice(0, 2000));

              const verifyStepId = agentRunService.beginStep(agentRun.runId, 'verify', 'Verify output');
              agentRunService.completeStep(agentRun.runId, verifyStepId, 'Output validated');
              agentRunService.completeRun(agentRun.runId);
              emitAgentRun();

              dataStream.writeMessageAnnotation({
                type: 'usage',
                value: {
                  completionTokens: cumulativeUsage.completionTokens,
                  promptTokens: cumulativeUsage.promptTokens,
                  totalTokens: cumulativeUsage.totalTokens,
                },
              });
              dataStream.writeData({
                type: 'progress',
                label: 'response',
                status: 'complete',
                order: progressCounter++,
                message: 'Response Generated',
              } satisfies ProgressAnnotation);
              await new Promise((resolve) => setTimeout(resolve, 0));

              // stream.close();
              return;
            }

            if (stream.switches >= MAX_RESPONSE_SEGMENTS) {
              throw Error('Cannot continue message: Maximum segments reached');
            }

            const switchesLeft = MAX_RESPONSE_SEGMENTS - stream.switches;

            logger.info(`Reached max token limit (${MAX_TOKENS}): Continuing message (${switchesLeft} switches left)`);

            const lastUserMessage = processedMessages.filter((x) => x.role == 'user').slice(-1)[0];
            const { model, provider } = extractPropertiesFromMessage(lastUserMessage);
            processedMessages.push({ id: generateId(), role: 'assistant', content });
            processedMessages.push({
              id: generateId(),
              role: 'user',
              content: `[Model: ${model}]\n\n[Provider: ${provider}]\n\n${CONTINUE_PROMPT}`,
            });

            const result = await streamText({
              messages: [...processedMessages],
              env: context.cloudflare?.env,
              options,
              apiKeys,
              files,
              providerSettings,
              promptId,
              contextOptimization,
              contextFiles: filteredFiles,
              chatMode,
              designScheme,
              summary,
              messageSliceId,
              customPrompt,
              ollamaBridgedSystemPromptSplit,
              forcedModel: model,
              forcedProvider: provider,
            });

            await (async () => {
              let hasLoggedFirstPart = false;
              let streamedPartCount = 0;
              let pendingFinishPart: any;
              let streamedTextBuffer = '';
              // Only buffer text-deltas for Ollama/local providers that may need normalization
              // or retries. Cloud providers (OpenAI, Anthropic, etc.) stream progressively.
              const shouldBufferContinuationBuildText = shouldNormalizeOllamaBuildMode({ chatMode, providerName: provider });

              for await (const part of result.fullStream) {
                streamedPartCount += 1;

                if (!hasLoggedFirstPart) {
                  hasLoggedFirstPart = true;
                  logger.info('First stream part received (continuation segment)', {
                    requestId: getRequestId(request),
                    clientRequestId: resolvedClientRequestId,
                    partType: part.type,
                    streamedPartCount,
                    model,
                    provider,
                  });
                }

                if (part.type === 'text-delta' && typeof part.text === 'string') {
                  streamedTextBuffer += part.text;
                }

                if (part.type === 'finish') {
                  pendingFinishPart = part;
                  continue;
                }

                if (shouldBufferContinuationBuildText && (part.type === 'text-delta' || part.type === 'reasoning-delta')) {
                  continue;
                }

                writeStreamPartToDataStream(part, dataStream);

                if (part.type === 'error') {
                  const error: any = part.error;
                  logger.error(`${error}`);

                  return;
                }
              }

              const continuationParts = collectBuildOutputParts(streamedTextBuffer, streamedTextBuffer);

              if (
                shouldNormalizeOllamaBuildMode({
                  chatMode,
                  providerName: provider,
                })
              ) {
                if (continuationParts.normalizedArtifact) {
                  logger.info('Injected Ollama build-mode artifact normalization (continuation segment)', {
                    requestId: getRequestId(request),
                    clientRequestId: resolvedClientRequestId,
                    model,
                    provider,
                    generatedChars: continuationParts.normalizedArtifact.length,
                  });
                }

                writeAssembledBuildOutput(continuationParts, dataStream);
              } else if (chatMode === 'build') {
                // For cloud providers text was already streamed; only add supplemental missing parts.
                const cloudHasArtifacts = hasExecutableFileAction(streamedTextBuffer);
                if (cloudHasArtifacts) {
                  if (continuationParts.missingFileArtifact) {
                    writeStreamPartToDataStream({ type: 'text-delta', text: continuationParts.missingFileArtifact }, dataStream);
                  }
                  if (continuationParts.previewStartAction) {
                    writeStreamPartToDataStream({ type: 'text-delta', text: continuationParts.previewStartAction }, dataStream);
                  }
                  if (continuationParts.missingProjectEssentials) {
                    writeStreamPartToDataStream({ type: 'text-delta', text: continuationParts.missingProjectEssentials }, dataStream);
                  }
                } else if (hasAssembledExecutableBuildOutput(continuationParts)) {
                  writeAssembledBuildOutput(continuationParts, dataStream);
                } else if (streamedTextBuffer.trim().length > 0) {
                  writeStreamPartToDataStream({ type: 'text-delta', text: streamedTextBuffer }, dataStream);
                }
              }

              if (pendingFinishPart) {
                writeStreamPartToDataStream(pendingFinishPart, dataStream);
              }
            })();

            return;
          },
        };

        dataStream.writeData({
          type: 'progress',
          label: 'response',
          status: 'in-progress',
          order: progressCounter++,
          message: 'Generating Response',
        } satisfies ProgressAnnotation);

        const result = await streamText({
          messages: [...processedMessages],
          env: context.cloudflare?.env,
          options,
          apiKeys,
          files,
          providerSettings,
          promptId,
          contextOptimization,
          contextFiles: filteredFiles,
          chatMode,
          designScheme,
          summary,
          messageSliceId,
          customPrompt,
          ollamaBridgedSystemPromptSplit,
          forcedModel: requestModelInfo.model,
          forcedProvider: requestModelInfo.provider,
        });

        await (async () => {
          let hasLoggedFirstPart = false;
          let streamedPartCount = 0;
          let pendingFinishPart: any;
          let streamedTextBuffer = '';
          const shouldNormalizeCurrentRequest = shouldNormalizeOllamaBuildMode({
            chatMode,
            providerName: requestModelInfo.provider,
          });
          // Only buffer text-deltas for Ollama/local providers (they may need retries/normalization).
          // Cloud providers (OpenAI, Anthropic, etc.) should stream tokens progressively.
          const shouldBufferCurrentBuildText = shouldNormalizeCurrentRequest;

          for await (const part of result.fullStream) {
            streamedPartCount += 1;

            if (!hasLoggedFirstPart) {
              hasLoggedFirstPart = true;
              logger.info('First stream part received', {
                requestId: getRequestId(request),
                clientRequestId: resolvedClientRequestId,
                partType: part.type,
                streamedPartCount,
                model: requestModelInfo.model,
                provider: requestModelInfo.provider,
              });
            }

            if (part.type === 'text-delta' && typeof part.text === 'string') {
              streamedTextBuffer += part.text;
            }

            if (part.type === 'finish') {
              pendingFinishPart = part;
              continue;
            }

            if (shouldBufferCurrentBuildText && (part.type === 'text-delta' || part.type === 'reasoning-delta')) {
              continue;
            }

            writeStreamPartToDataStream(part, dataStream);
            streamRecovery.updateActivity();

            if (part.type === 'error') {
              const error: any = part.error;
              logger.error('Streaming error:', error);
              agentRunService.failRun(agentRun.runId, error, 'execute');
              emitAgentRun();
              streamRecovery.stop();

              // Enhanced error handling for common streaming issues
              if (error.message?.includes('Invalid JSON response')) {
                logger.error('Invalid JSON response detected - likely malformed API response');
              } else if (error.message?.includes('token')) {
                logger.error('Token-related error detected - possible token limit exceeded');
              }

              return;
            }
          }

          const initialRequestParts = collectBuildOutputParts(streamedTextBuffer, streamedTextBuffer);
          const initialOutputSnapshot = buildOutputSnapshot(initialRequestParts, streamedTextBuffer);
          const initialMissingRequestedTargets = getMissingRequestedFilePaths(requestedFileTargets, initialOutputSnapshot);
          const shouldRetryForMissingTargets = requestedFileTargets.length > 0 && initialMissingRequestedTargets.length > 0;

          if (shouldNormalizeCurrentRequest && (shouldRetryOllamaBuildNarrative(streamedTextBuffer) || shouldRetryForMissingTargets)) {
            const retryRoundLimit = getOllamaRecoveryRoundLimit({
              providerName: requestModelInfo.provider,
              chatMode,
              ollamaBridgedSystemPromptSplit,
              modelName: requestModelInfo.model,
            });

            logger.warn('Ollama build-mode response requires recovery rounds', {
              requestId: getRequestId(request),
              clientRequestId: resolvedClientRequestId,
              model: requestModelInfo.model,
              provider: requestModelInfo.provider,
              retryRoundLimit,
              requestedFileTargets,
              missingRequestedTargets: initialMissingRequestedTargets,
              originalResponsePreview: toLogPreview(streamedTextBuffer),
            });

            let lastRoundText = streamedTextBuffer;
            let lastRoundFinishPart = pendingFinishPart;
            let recovered = false;

            for (let retryRound = 1; retryRound <= retryRoundLimit; retryRound += 1) {
              const missingTargetsForRound = getMissingRequestedFilePaths(
                requestedFileTargets,
                retryRound === 1 ? initialOutputSnapshot : lastRoundText,
              );
              const missingTargetsInstruction =
                missingTargetsForRound.length > 0
                  ? `Required requested file targets still missing: ${missingTargetsForRound.join(', ')}. Include those files explicitly as <boltAction type="file" filePath="..."> with complete content.`
                  : '';
              const retryInstruction =
                retryRound === 1
                  ? `Build mode correction: your previous answer was not fully executable for the original request. Return ONLY executable output using one <boltArtifact> with <boltAction> blocks. Recover into concrete project files that match implementation intent (examples: /index.html, /package.json, /server.js, /main.py, /App.tsx, /index.php, /routes/web.php, /vite.config.ts). ${missingTargetsInstruction} Do not include prose outside the artifact.`
                  : `Build mode correction round ${retryRound}: previous recovery output was still incomplete/non-executable. Continue from your last attempt and return one complete executable <boltArtifact> only, with full <boltAction> file contents and required start action. ${missingTargetsInstruction}`;

              dataStream.writeData({
                type: 'debugStream',
                eventId: generateId(),
                source: 'ollama-background-reask',
                phase: 'start',
                message: `Narrative/incomplete build response detected; starting recovery round ${retryRound}/${retryRoundLimit}.`,
                requestId: getRequestId(request),
                clientRequestId: resolvedClientRequestId,
                provider: requestModelInfo.provider,
                model: requestModelInfo.model,
                retryRound,
                retryRoundLimit,
                originalResponsePreview: toLogPreview(lastRoundText, 800),
                retryInstructionPreview: toLogPreview(retryInstruction, 800),
              });

              dataStream.writeData({
                type: 'progress',
                label: 'response-retry',
                status: 'in-progress',
                order: progressCounter++,
                message: `Refining response into executable build actions (round ${retryRound}/${retryRoundLimit})`,
              } satisfies ProgressAnnotation);

              const retryResult = await streamText({
                messages: [
                  ...processedMessages,
                  { id: generateId(), role: 'assistant', content: lastRoundText },
                  {
                    id: generateId(),
                    role: 'user',
                    content: `[Model: ${requestModelInfo.model || 'deepseek-coder-v2:latest'}]\n\n[Provider: ${requestModelInfo.provider || 'Ollama'}]\n\n${retryInstruction}`,
                  },
                ] as any,
                env: context.cloudflare?.env,
                options,
                apiKeys,
                files,
                providerSettings,
                promptId,
                contextOptimization,
                contextFiles: filteredFiles,
                chatMode,
                designScheme,
                summary,
                messageSliceId,
                customPrompt,
                ollamaBridgedSystemPromptSplit,
                forcedModel: requestModelInfo.model,
                forcedProvider: requestModelInfo.provider,
              });

              let retryPendingFinishPart: any;
              let retryTextBuffer = '';
              let retryPartCount = 0;

              for await (const part of retryResult.fullStream) {
                retryPartCount += 1;

                if (retryPartCount === 1) {
                  logger.info('First stream part received (background re-ask)', {
                    requestId: getRequestId(request),
                    clientRequestId: resolvedClientRequestId,
                    partType: part.type,
                    model: requestModelInfo.model,
                    provider: requestModelInfo.provider,
                    retryRound,
                    retryRoundLimit,
                  });
                }

                if (part.type === 'text-delta' && typeof part.text === 'string') {
                  retryTextBuffer += part.text;
                }

                if (part.type === 'finish') {
                  retryPendingFinishPart = part;
                  continue;
                }

                if (part.type === 'text-delta' || part.type === 'reasoning-delta') {
                  continue;
                }

                writeStreamPartToDataStream(part, dataStream);
                streamRecovery.updateActivity();

                if (part.type === 'error') {
                  const error: any = part.error;
                  logger.error('Streaming error during background re-ask:', error);
                  agentRunService.failRun(agentRun.runId, error, 'execute');
                  emitAgentRun();
                  streamRecovery.stop();
                  return;
                }
              }

              const retryParts = collectBuildOutputParts(retryTextBuffer, streamedTextBuffer);
              const retryOutputSnapshot = buildOutputSnapshot(retryParts, retryTextBuffer);
              const missingRequestedTargets = getMissingRequestedFilePaths(requestedFileTargets, retryOutputSnapshot);

              logger.info('Ollama background re-ask round completed', {
                requestId: getRequestId(request),
                clientRequestId: resolvedClientRequestId,
                model: requestModelInfo.model,
                provider: requestModelInfo.provider,
                retryRound,
                retryRoundLimit,
                missingRequestedTargets,
                retryResponsePreview: toLogPreview(retryTextBuffer),
                normalizedArtifactApplied: Boolean(retryParts.normalizedArtifact),
              });

              dataStream.writeData({
                type: 'debugStream',
                eventId: generateId(),
                source: 'ollama-background-reask',
                phase: 'complete',
                message: `Recovery round ${retryRound}/${retryRoundLimit} completed.`,
                requestId: getRequestId(request),
                clientRequestId: resolvedClientRequestId,
                provider: requestModelInfo.provider,
                model: requestModelInfo.model,
                retryRound,
                retryRoundLimit,
                normalizedArtifactApplied: Boolean(retryParts.normalizedArtifact),
                retryResponsePreview: toLogPreview(retryTextBuffer, 800),
              });

              const hasExecutableOutput = hasAssembledExecutableBuildOutput(retryParts);
              const hasSatisfiedRequestedTargets = missingRequestedTargets.length === 0;
              const canFinalizeRound = hasExecutableOutput && hasSatisfiedRequestedTargets;

              if (canFinalizeRound || retryRound === retryRoundLimit) {
                if (hasExecutableOutput) {
                  writeAssembledBuildOutput(retryParts, dataStream);
                } else if (retryTextBuffer.trim().length > 0) {
                  writeStreamPartToDataStream({ type: 'text-delta', text: retryTextBuffer }, dataStream);
                }

                dataStream.writeData({
                  type: 'progress',
                  label: 'response-retry',
                  status: 'complete',
                  order: progressCounter++,
                  message: canFinalizeRound
                    ? `Executable build actions generated (round ${retryRound}/${retryRoundLimit})`
                    : `Recovery ended at round ${retryRound}/${retryRoundLimit}; best available executable output emitted`,
                } satisfies ProgressAnnotation);

                if (retryPendingFinishPart) {
                  writeStreamPartToDataStream(retryPendingFinishPart, dataStream);
                } else if (pendingFinishPart) {
                  writeStreamPartToDataStream(pendingFinishPart, dataStream);
                }

                recovered = true;
                streamRecovery.stop();
                return;
              }

              lastRoundText = retryTextBuffer;
              lastRoundFinishPart = retryPendingFinishPart || lastRoundFinishPart;
            }

            if (!recovered && lastRoundText.trim().length > 0) {
              const lastRoundPassThrough = getBuildOutputToPassThrough(lastRoundText);

              if (lastRoundPassThrough) {
                writeStreamPartToDataStream({ type: 'text-delta', text: lastRoundPassThrough }, dataStream);
              } else {
                writeStreamPartToDataStream({ type: 'text-delta', text: lastRoundText }, dataStream);
              }

              if (lastRoundFinishPart) {
                writeStreamPartToDataStream(lastRoundFinishPart, dataStream);
              }

              streamRecovery.stop();
              return;
            }
          }

          const currentRequestParts = collectBuildOutputParts(streamedTextBuffer, streamedTextBuffer);

          if (shouldNormalizeCurrentRequest) {
            if (currentRequestParts.normalizedArtifact) {
              logger.info('Injected Ollama build-mode artifact normalization', {
                requestId: getRequestId(request),
                clientRequestId: resolvedClientRequestId,
                model: requestModelInfo.model,
                provider: requestModelInfo.provider,
                generatedChars: currentRequestParts.normalizedArtifact.length,
              });
            }

            writeAssembledBuildOutput(currentRequestParts, dataStream);
          } else if (chatMode === 'build') {
            // Text was already streamed for cloud providers.
            // Only append supplemental missing pieces that weren't in the original response.
            const cloudOutputHasArtifactActions = hasExecutableFileAction(streamedTextBuffer);
            if (cloudOutputHasArtifactActions) {
              logger.info('Cloud build-mode: appending any supplemental missing project pieces', {
                requestId: getRequestId(request),
                clientRequestId: resolvedClientRequestId,
                model: requestModelInfo.model,
                provider: requestModelInfo.provider,
                missingFileArtifactApplied: Boolean(currentRequestParts.missingFileArtifact),
                previewStartActionApplied: Boolean(currentRequestParts.previewStartAction),
                missingProjectEssentialsApplied: Boolean(currentRequestParts.missingProjectEssentials),
              });
              if (currentRequestParts.missingFileArtifact) {
                writeStreamPartToDataStream({ type: 'text-delta', text: currentRequestParts.missingFileArtifact }, dataStream);
              }
              if (currentRequestParts.previewStartAction) {
                writeStreamPartToDataStream({ type: 'text-delta', text: currentRequestParts.previewStartAction }, dataStream);
              }
              if (currentRequestParts.missingProjectEssentials) {
                writeStreamPartToDataStream({ type: 'text-delta', text: currentRequestParts.missingProjectEssentials }, dataStream);
              }
            } else if (hasAssembledExecutableBuildOutput(currentRequestParts)) {
              // Cloud returned non-bolt output; fall back to assembled normalization.
              logger.info('Cloud build-mode: non-bolt output detected, applying assembled normalization fallback', {
                requestId: getRequestId(request),
                clientRequestId: resolvedClientRequestId,
                model: requestModelInfo.model,
                provider: requestModelInfo.provider,
              });
              writeAssembledBuildOutput(currentRequestParts, dataStream);
            } else if (streamedTextBuffer.trim().length > 0) {
              writeStreamPartToDataStream({ type: 'text-delta', text: streamedTextBuffer }, dataStream);
            }
          }

          if (pendingFinishPart) {
            writeStreamPartToDataStream(pendingFinishPart, dataStream);
          }

          streamRecovery.stop();
        })();
      },
      onError: (error: any) => {
        agentRunService.failRun(agentRun.runId, error);

        // Provide more specific error messages for common issues
        const errorMessage = error.message || 'Unknown error';

        if (errorMessage.includes('model') && errorMessage.includes('not found')) {
          return 'Custom error: Invalid model selected. Please check that the model name is correct and available.';
        }

        if (errorMessage.includes('Invalid JSON response')) {
          return 'Custom error: The AI service returned an invalid response. This may be due to an invalid model name, API rate limiting, or server issues. Try selecting a different model or check your API key.';
        }

        if (
          errorMessage.includes('API key') ||
          errorMessage.includes('unauthorized') ||
          errorMessage.includes('authentication')
        ) {
          return 'Custom error: Invalid or missing API key. Please check your API key configuration.';
        }

        if (errorMessage.includes('token') && errorMessage.includes('limit')) {
          return 'Custom error: Token limit exceeded. The conversation is too long for the selected model. Try using a model with larger context window or start a new conversation.';
        }

        if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
          return 'Custom error: API rate limit exceeded. Please wait a moment before trying again.';
        }

        if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
          return 'Custom error: Network error. Please check your internet connection and try again.';
        }

        return `Custom error: ${errorMessage}`;
      },
    }).pipeThrough(
      new TransformStream({
        transform: (chunk, controller) => {
          if (typeof chunk === 'string') {
            controller.enqueue(encoder.encode(chunk));
            return;
          }

          controller.enqueue(chunk);
        },
      }),
    );

    return new Response(dataStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
        'Text-Encoding': 'chunked',
      },
    });
  } catch (error: any) {
    agentRunService.failRun(agentRun.runId, error);
    logger.error(error);

    const errorResponse = {
      error: true,
      message: error.message || 'An unexpected error occurred',
      statusCode: error.statusCode || 500,
      isRetryable: error.isRetryable !== false, // Default to retryable unless explicitly false
      provider: error.provider || 'unknown',
    };

    if (error.message?.includes('API key')) {
      return new Response(
        JSON.stringify({
          ...errorResponse,
          message: 'Invalid or missing API key',
          statusCode: 401,
          isRetryable: false,
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
          statusText: 'Unauthorized',
        },
      );
    }

    return new Response(JSON.stringify(errorResponse), {
      status: errorResponse.statusCode,
      headers: { 'Content-Type': 'application/json' },
      statusText: 'Error',
    });
  }
}
