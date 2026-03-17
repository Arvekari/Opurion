import { convertToModelMessages, streamText as _streamText, type Message } from 'ai';
import { MAX_TOKENS, PROVIDER_COMPLETION_LIMITS, isReasoningModel, type FileMap } from './constants';
import { getSystemPrompt } from '~/lib/common/prompts/prompts';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, MODIFICATIONS_TAG_NAME, WORK_DIR } from '~/utils/constants';
import type { IProviderSetting } from '~/types/model';
import { PromptLibrary } from '~/lib/common/prompt-library';
import { allowedHTMLElements } from '~/utils/markdown';
import { LLMManager } from '~/lib/modules/llm/manager';
import { createScopedLogger } from '~/utils/logger';
import { createFilesContext, extractPropertiesFromMessage } from './utils';
import { discussPrompt } from '~/lib/common/prompts/discuss-prompt';
import type { DesignScheme } from '~/types/design-scheme';
import { applyPromptPolicy } from '~/lib/.server/llm/prompt-policy';
import { ensureWebStreamCompatibility } from '~/lib/.server/llm/web-stream-compat';
import {
  DEFAULT_PROMPT_FALLBACK_PROFILE_KEYS,
  inferModelSizeInBillions,
  isModelEligibleForCustomPromptProfiles,
  resolveProfileKeyForModel,
  sanitizePromptProfiles,
  type SystemPromptProfiles,
} from '~/lib/common/system-prompt-profiles';
import { buildWorkspaceContinuationPromptAddon } from './workspace-continuity';

export type Messages = Message[];

export interface StreamingOptions extends Omit<Parameters<typeof _streamText>[0], 'model'> {
  supabaseConnection?: {
    isConnected: boolean;
    hasSelectedProject: boolean;
    credentials?: {
      anonKey?: string;
      supabaseUrl?: string;
    };
  };
}

const logger = createScopedLogger('stream-text');
const LOCAL_SYSTEM_PROMPT_BRIDGE_PROVIDERS = new Set(['Ollama', 'LMStudio', 'OpenAILike']);

function isCompletionOnlyOpenAIModel(providerName: string, modelName: string): boolean {
  if (providerName !== 'OpenAI') {
    return false;
  }

  const normalized = modelName.toLowerCase();

  return normalized.endsWith('-instruct') || normalized.startsWith('text-');
}

export function isOpenAIResponsesModel(providerName: string, modelName: string): boolean {
  if (providerName !== 'OpenAI') {
    return false;
  }

  const normalized = modelName.toLowerCase();

  return normalized.includes('codex');
}

export function isToolCallingDisabledForProvider(_providerName: string): boolean {
  return false;
}

export function shouldBridgeSystemPromptToMessages(providerName: string): boolean {
  return LOCAL_SYSTEM_PROMPT_BRIDGE_PROVIDERS.has(providerName);
}

function isLocalProvider(providerName: string): boolean {
  return LOCAL_SYSTEM_PROMPT_BRIDGE_PROVIDERS.has(providerName);
}

function isTruthyFlag(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function isOllamaForceSingleMessageEnabled(serverEnv?: Env, requestOverride?: boolean): boolean {
  if (typeof requestOverride === 'boolean') {
    return requestOverride;
  }

  const envValue = serverEnv
    ? ((serverEnv as unknown as Record<string, unknown>)['OLLAMA_BRIDGED_SYSTEM_PROMPT_SPLIT'] as unknown)
    : undefined;
  const processValue = process.env.OLLAMA_BRIDGED_SYSTEM_PROMPT_SPLIT;

  return isTruthyFlag(envValue) || isTruthyFlag(processValue);
}

export function bridgeSystemPromptIntoMessages(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  systemPrompt: string,
  options?: {
    splitIntoParts?: boolean;
    maxPartChars?: number;
  },
): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
  const firstUserIndex = messages.findIndex((message) => message.role === 'user');

  if (firstUserIndex === -1 || !systemPrompt.trim()) {
    return messages;
  }

  const splitSystemPromptIntoParts = (input: string, maxPartChars: number): string[] => {
    const paragraphs = input
      .split(/\n\s*\n/g)
      .map((part) => part.trim())
      .filter(Boolean);
    const parts: string[] = [];
    let current = '';

    for (const paragraph of paragraphs) {
      if (!current) {
        if (paragraph.length <= maxPartChars) {
          current = paragraph;
          continue;
        }

        for (let index = 0; index < paragraph.length; index += maxPartChars) {
          parts.push(paragraph.slice(index, index + maxPartChars).trim());
        }

        continue;
      }

      const candidate = `${current}\n\n${paragraph}`;

      if (candidate.length <= maxPartChars) {
        current = candidate;
        continue;
      }

      parts.push(current);

      if (paragraph.length <= maxPartChars) {
        current = paragraph;
        continue;
      }

      for (let index = 0; index < paragraph.length; index += maxPartChars) {
        parts.push(paragraph.slice(index, index + maxPartChars).trim());
      }

      current = '';
    }

    if (current) {
      parts.push(current);
    }

    return parts.filter(Boolean);
  };

  const MAX_DIRECTIVE_PARTS = 5;
  const normalizedSystemPrompt = systemPrompt.trim();
  const baseMaxPartChars = Math.max(200, options?.maxPartChars ?? 900);

  const splitParts = options?.splitIntoParts
    ? (() => {
        let computedParts = splitSystemPromptIntoParts(normalizedSystemPrompt, baseMaxPartChars);

        if (computedParts.length <= MAX_DIRECTIVE_PARTS) {
          return computedParts;
        }

        let adaptiveMaxPartChars = Math.max(baseMaxPartChars, Math.ceil(normalizedSystemPrompt.length / MAX_DIRECTIVE_PARTS));

        for (let attempt = 0; attempt < 4 && computedParts.length > MAX_DIRECTIVE_PARTS; attempt += 1) {
          adaptiveMaxPartChars = Math.ceil(adaptiveMaxPartChars * 1.25);
          computedParts = splitSystemPromptIntoParts(normalizedSystemPrompt, adaptiveMaxPartChars);
        }

        if (computedParts.length <= MAX_DIRECTIVE_PARTS) {
          return computedParts;
        }

        return [...computedParts.slice(0, MAX_DIRECTIVE_PARTS - 1), computedParts.slice(MAX_DIRECTIVE_PARTS - 1).join('\n\n')];
      })()
    : [];

  const bridgedSystemPrompt =
    splitParts.length > 1
      ? `<system_directives>
${splitParts
  .map(
    (part, index) => `<directive_part index="${index + 1}" total="${splitParts.length}">
${part}
</directive_part>`,
  )
  .join('\n\n')}
</system_directives>

Read every directive_part above as one instruction set.
All directive parts have equal force and must be followed together.
If the active mode is build, implement instead of giving a chatty high-level answer.`
      : `<system_directives>
    ${normalizedSystemPrompt}
</system_directives>

Follow the system directives above exactly.`;

  return messages.map((message, index) => {
    if (index !== firstUserIndex) {
      return message;
    }

    return {
      ...message,
      content: `${bridgedSystemPrompt}

${message.content}`,
    };
  });
}

function getCompletionTokenLimit(modelDetails: any): number {
  // 1. If model specifies completion tokens, use that
  if (modelDetails.maxCompletionTokens && modelDetails.maxCompletionTokens > 0) {
    return modelDetails.maxCompletionTokens;
  }

  // 2. Use provider-specific default
  const providerDefault = PROVIDER_COMPLETION_LIMITS[modelDetails.provider];

  if (providerDefault) {
    return providerDefault;
  }

  // 3. Final fallback to MAX_TOKENS, but cap at reasonable limit for safety
  return Math.min(MAX_TOKENS, 16384);
}

function sanitizeText(text: string): string {
  let sanitized = text.replace(/<div class=\\"__boltThought__\\">.*?<\/div>/s, '');
  sanitized = sanitized.replace(/<think>.*?<\/think>/s, '');
  sanitized = sanitized.replace(/<boltAction type="file" filePath="package-lock\.json">[\s\S]*?<\/boltAction>/g, '');

  return sanitized.trim();
}

export function hasToolDefinitions(tools: unknown): boolean {
  if (!tools || typeof tools !== 'object' || Array.isArray(tools)) {
    return false;
  }

  return Object.keys(tools as Record<string, unknown>).length > 0;
}

function getBuildModeExecutionContract(): string {
  return `<build_mode_execution_contract>
ACTIVE MODE: build
You MUST return executable output using Bolt markup.
Required shape:
- One <boltArtifact id="..." title="..."> block.
- Inside it, use <boltAction type="file" filePath="...">FULL FILE CONTENT</boltAction> for every changed/created file.
- Include required install/start actions when needed.
Do NOT return prose-only planning when implementation is requested.
Do NOT return patch/diff format.
</build_mode_execution_contract>`;
}

export async function streamText(props: {
  messages: Omit<Message, 'id'>[];
  env?: Env;
  options?: StreamingOptions;
  apiKeys?: Record<string, string>;
  files?: FileMap;
  providerSettings?: Record<string, IProviderSetting>;
  promptId?: string;
  contextOptimization?: boolean;
  contextFiles?: FileMap;
  summary?: string;
  messageSliceId?: number;
  chatMode?: 'discuss' | 'build';
  designScheme?: DesignScheme;
  customPrompt?: {
    enabled: boolean;
    instructions: string;
    mode?: 'append' | 'replace';
    autoProfileByModelSize?: boolean;
    activeProfileKey?: string;
    profiles?: SystemPromptProfiles;
    promptLibraryOverrides?: Record<string, string>;
  };
  ollamaBridgedSystemPromptSplit?: boolean;
  forcedModel?: string;
  forcedProvider?: string;
}) {
  ensureWebStreamCompatibility();

  const {
    messages,
    env: serverEnv,
    options,
    apiKeys,
    files,
    providerSettings,
    promptId,
    contextOptimization,
    contextFiles,
    summary,
    chatMode,
    designScheme,
    customPrompt,
    ollamaBridgedSystemPromptSplit,
    forcedModel,
    forcedProvider,
  } = props;
  const pinnedModel = forcedModel?.trim();
  const pinnedProvider = forcedProvider?.trim();
  let currentModel = pinnedModel || DEFAULT_MODEL;
  let currentProvider = pinnedProvider || DEFAULT_PROVIDER.name;
  let processedMessages = messages.map((message) => {
    const newMessage = { ...message };

    if (message.role === 'user') {
      const { model, provider, content } = extractPropertiesFromMessage(message);
      currentModel = pinnedModel || model;
      currentProvider = pinnedProvider || provider;
      newMessage.content = sanitizeText(content);
    } else if (message.role == 'assistant') {
      newMessage.content = sanitizeText(message.content);
    }

    // Sanitize all text parts in parts array, if present
    if (Array.isArray(message.parts)) {
      newMessage.parts = message.parts.map((part) =>
        part.type === 'text' ? { ...part, text: sanitizeText(part.text) } : part,
      );
    }

    return newMessage;
  });

  const llmManager = LLMManager.getInstance(serverEnv as Record<string, string>);
  const provider = llmManager.getProvider(currentProvider) || llmManager.getDefaultProvider();
  const staticModels = LLMManager.getInstance().getStaticModelListFromProvider(provider);
  let modelDetails = staticModels.find((m) => m.name === currentModel);

  let dynamicModelDetails: any | undefined;

  try {
    const providerModels = await LLMManager.getInstance().getModelListFromProvider(provider, {
      apiKeys,
      providerSettings,
      serverEnv: serverEnv as any,
    });

    dynamicModelDetails = providerModels.find((m) => m.name === currentModel);
  } catch (error) {
    logger.warn(`Failed to resolve dynamic model metadata for ${provider.name}/${currentModel}:`, error);
  }

  if (dynamicModelDetails) {
    modelDetails = dynamicModelDetails;
  }

  if (!modelDetails) {
    const modelsList = [...(provider.staticModels || []), ...(dynamicModelDetails ? [dynamicModelDetails] : [])];

    if (!modelsList.length) {
      throw new Error(`No models found for provider ${provider.name}`);
    }

    modelDetails = modelsList.find((m) => m.name === currentModel);

    if (!modelDetails) {
      // Check if it's a Google provider and the model name looks like it might be incorrect
      if (provider.name === 'Google' && currentModel.includes('2.5')) {
        throw new Error(
          `Model "${currentModel}" not found. Gemini 2.5 Pro doesn't exist. Available Gemini models include: gemini-1.5-pro, gemini-2.0-flash, gemini-1.5-flash. Please select a valid model.`,
        );
      }

      // Fallback to first model with warning
      logger.warn(
        `MODEL [${currentModel}] not found in provider [${provider.name}]. Falling back to first model. ${modelsList[0].name}`,
      );
      modelDetails = modelsList[0];
    }
  }

  if (pinnedModel || pinnedProvider) {
    logger.info('Using pinned provider/model for stream call', {
      pinnedModel,
      pinnedProvider,
      resolvedModel: modelDetails?.name ?? currentModel,
      resolvedProvider: provider.name,
    });
  }

  if (!modelDetails) {
    throw new Error(`Model details were not resolved for provider ${provider.name}`);
  }

  const dynamicMaxTokens = modelDetails ? getCompletionTokenLimit(modelDetails) : Math.min(MAX_TOKENS, 16384);

  // Cap at maxTokenAllowed so we never request more tokens than the model's context supports
  const safeMaxTokens =
    modelDetails?.maxTokenAllowed && modelDetails.maxTokenAllowed > 0
      ? Math.min(dynamicMaxTokens, modelDetails.maxTokenAllowed)
      : dynamicMaxTokens;

  logger.info(
    `Token limits for model ${modelDetails.name}: maxTokens=${safeMaxTokens}, maxTokenAllowed=${modelDetails.maxTokenAllowed}, maxCompletionTokens=${modelDetails.maxCompletionTokens}`,
  );

  let systemPrompt =
    PromptLibrary.getPropmtFromLibrary(promptId || 'default', {
      cwd: WORK_DIR,
      allowedHtmlElements: allowedHTMLElements,
      modificationTagName: MODIFICATIONS_TAG_NAME,
      designScheme,
      supabase: {
        isConnected: options?.supabaseConnection?.isConnected || false,
        hasSelectedProject: options?.supabaseConnection?.hasSelectedProject || false,
        credentials: options?.supabaseConnection?.credentials || undefined,
      },
    }) ?? getSystemPrompt();

  const selectedPromptId = promptId || 'default';
  const libraryOverride = customPrompt?.promptLibraryOverrides?.[selectedPromptId];

  if (typeof libraryOverride === 'string' && libraryOverride.trim().length > 0) {
    systemPrompt = libraryOverride;
  }

  let effectiveCustomPromptBody = customPrompt?.instructions?.trim() || '';
  let effectiveCustomPromptMode: 'append' | 'replace' = customPrompt?.mode === 'replace' ? 'replace' : 'append';

  if (customPrompt?.enabled && customPrompt.profiles) {
    const profiles = sanitizePromptProfiles(customPrompt.profiles, customPrompt.instructions || '');
    const modelEligibleForCustomPrompts = isModelEligibleForCustomPromptProfiles(modelDetails.name);
    const profileKey = customPrompt.autoProfileByModelSize
      ? resolveProfileKeyForModel(modelDetails.name)
      : (customPrompt.activeProfileKey as keyof SystemPromptProfiles) || '16B';
    const selectedProfile = profiles[profileKey] || profiles['16B'];

    const useDefaultPromptByCapacity = DEFAULT_PROMPT_FALLBACK_PROFILE_KEYS.includes(profileKey);
    const useDefaultPromptByProvider = !isLocalProvider(provider.name);

    if (modelEligibleForCustomPrompts && selectedProfile && !useDefaultPromptByCapacity && !useDefaultPromptByProvider) {
      effectiveCustomPromptBody = selectedProfile.instructions.trim();
      effectiveCustomPromptMode = selectedProfile.mode;
    } else {
      effectiveCustomPromptBody = '';
      effectiveCustomPromptMode = 'append';
    }
  }

  if (customPrompt?.enabled && effectiveCustomPromptBody.length > 0) {
    const customPromptBody = effectiveCustomPromptBody;

    if (effectiveCustomPromptMode === 'replace') {
      systemPrompt = customPromptBody;
    } else {
      systemPrompt = `<custom_system_prompt>
${customPromptBody}
</custom_system_prompt>

${systemPrompt}

`;
    }
  }

  if (chatMode === 'build' && contextFiles && contextOptimization) {
    const codeContext = createFilesContext(contextFiles, true);

    systemPrompt = `${systemPrompt}

    Below is the artifact containing the context loaded into context buffer for you to have knowledge of and might need changes to fullfill current user request.
    CONTEXT BUFFER:
    ---
    ${codeContext}
    ---
    `;

    if (summary) {
      systemPrompt = `${systemPrompt}
      below is the chat history till now
      CHAT SUMMARY:
      ---
      ${props.summary}
      ---
      `;

      if (props.messageSliceId) {
        processedMessages = processedMessages.slice(props.messageSliceId);
      } else {
        const lastMessage = processedMessages.pop();

        if (lastMessage) {
          processedMessages = [lastMessage];
        }
      }
    }
  }

  const workspaceContinuationPrompt = buildWorkspaceContinuationPromptAddon({
    chatMode,
    messages: processedMessages,
    files,
    summary,
  });

  if (workspaceContinuationPrompt) {
    systemPrompt = `${systemPrompt}

    ${workspaceContinuationPrompt}
    `;
  }

  const effectiveLockedFilePaths = new Set<string>();

  if (files) {
    for (const [filePath, fileDetails] of Object.entries(files)) {
      if (fileDetails?.isLocked) {
        effectiveLockedFilePaths.add(filePath);
      }
    }
  }

  if (effectiveLockedFilePaths.size > 0) {
    const lockedFilesListString = Array.from(effectiveLockedFilePaths)
      .map((filePath) => `- ${filePath}`)
      .join('\n');
    systemPrompt = `${systemPrompt}

    IMPORTANT: The following files are locked and MUST NOT be modified in any way. Do not suggest or make any changes to these files. You can proceed with the request but DO NOT make any changes to these files specifically:
    ${lockedFilesListString}
    ---
    `;
  } else {
    console.log('No locked files found from any source for prompt.');
  }

  logger.info(`Sending llm call to ${provider.name} with model ${modelDetails.name}`);

  // Log model execution mode and token parameters
  const completionOnlyModel = isCompletionOnlyOpenAIModel(provider.name, modelDetails.name);
  const disableToolCalling = isToolCallingDisabledForProvider(provider.name);
  const isReasoning = !completionOnlyModel && isReasoningModel(modelDetails.name);
  logger.info(
    `Model "${modelDetails.name}" completionOnly=${completionOnlyModel} reasoning=${isReasoning}, using ${isReasoning ? 'maxCompletionTokens' : 'maxTokens'}: ${safeMaxTokens}`,
  );

  // Validate token limits before API call
  if (safeMaxTokens > (modelDetails.maxTokenAllowed || 128000)) {
    logger.warn(
      `Token limit warning: requesting ${safeMaxTokens} tokens but model supports max ${modelDetails.maxTokenAllowed || 128000}`,
    );
  }

  const baseOptions = { ...(options || {}) } as Record<string, any>;
  delete baseOptions.supabaseConnection;
  delete baseOptions.maxTokens;
  delete baseOptions.maxCompletionTokens;
  delete baseOptions.maxOutputTokens;

  const sanitizedBaseOptions = Object.fromEntries(
    Object.entries(baseOptions).filter(([_key, value]) => value !== undefined),
  );

  // Filter out unsupported parameters for reasoning models
  let filteredOptions = sanitizedBaseOptions;

  if (isReasoning) {
    filteredOptions = Object.fromEntries(
      Object.entries(baseOptions).filter(
        ([key]) =>
          ![
            'temperature',
            'topP',
            'presencePenalty',
            'frequencyPenalty',
            'logprobs',
            'topLogprobs',
            'logitBias',
          ].includes(key),
      ),
    );
  }

  if (completionOnlyModel || disableToolCalling) {
    delete (filteredOptions as any).tools;
    delete (filteredOptions as any).toolChoice;
    delete (filteredOptions as any).maxSteps;
    delete (filteredOptions as any).onStepFinish;
  }

  if (!hasToolDefinitions((filteredOptions as any).tools)) {
    delete (filteredOptions as any).tools;
    delete (filteredOptions as any).toolChoice;
    delete (filteredOptions as any).maxSteps;
    delete (filteredOptions as any).onStepFinish;
  }

  // DEBUG: Log filtered options
  logger.info(
    `DEBUG STREAM: Options filtering for model "${modelDetails.name}":`,
    JSON.stringify(
      {
        completionOnlyModel,
        disableToolCalling,
        isReasoning,
        originalOptions: options || {},
        filteredOptions,
        originalOptionsKeys: options ? Object.keys(options) : [],
        filteredOptionsKeys: Object.keys(filteredOptions),
        removedParams: options ? Object.keys(options).filter((key) => !(key in filteredOptions)) : [],
      },
      null,
      2,
    ),
  );

  const selectedSystemPromptBase = chatMode === 'build' ? systemPrompt : discussPrompt();
  const activeMode = chatMode === 'build' ? 'build' : 'discussion';
  const runtimeModeDirective =
    chatMode === 'build'
      ? `
<mode_control>
ACTIVE MODE: build
This response is in build mode. Prioritize implementation and execution output.
Do not default to analysis-only discussion when the request is implementation-oriented.
</mode_control>
`.trim()
      : `
<mode_control>
ACTIVE MODE: discussion
This response is in discussion mode. Prioritize planning, analysis, and explanation unless implementation is explicitly requested.
</mode_control>
`.trim();

  const selectedSystemPrompt = `${selectedSystemPromptBase}

${runtimeModeDirective}

<runtime_context>
active_mode: ${activeMode}
</runtime_context>`;

  // Create simplified messages for prompt policy (role + content only)
  const policyMessages: any = processedMessages.map((message) => ({
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: String(message.content || ''),
  }));

  const optimizedPrompt = applyPromptPolicy({
    system: selectedSystemPrompt,
    messages: policyMessages,
    modelName: modelDetails.name,
    modelMeta: {
      maxTokenAllowed: modelDetails.maxTokenAllowed,
    },
  });

  logger.info(
    `Prompt policy selected profile: ${optimizedPrompt.profile.modelClass} (pruned=${optimizedPrompt.diagnostics.wasPruned})`,
  );

  const inferredModelSizeB = inferModelSizeInBillions(modelDetails.name);
  const isOllamaProvider = provider.name === 'Ollama';
  const ollamaForceSingleMessageEnabled = isOllamaForceSingleMessageEnabled(serverEnv, ollamaBridgedSystemPromptSplit);
  const forceOllamaSingleMessageForABTest = isOllamaProvider && ollamaForceSingleMessageEnabled;
  const allowBridgedPromptSplitting = !isOllamaProvider || !ollamaForceSingleMessageEnabled;
  const bridgedPromptPartChars = optimizedPrompt.profile.modelClass === 'small' ? 700 : 900;
  const requiresSplitForOllamaPromptLength =
    isOllamaProvider &&
    optimizedPrompt.system.trim().length > Math.max(bridgedPromptPartChars, Math.floor(bridgedPromptPartChars * 1.15));
  const shouldSplitBridgedSystemPrompt =
    !forceOllamaSingleMessageForABTest &&
    (allowBridgedPromptSplitting || requiresSplitForOllamaPromptLength) &&
    isLocalProvider(provider.name) &&
    (requiresSplitForOllamaPromptLength ||
      optimizedPrompt.profile.modelClass === 'small' ||
      (inferredModelSizeB !== null && inferredModelSizeB <= 16));

  if (isOllamaProvider) {
    logger.info('Ollama bridged system prompt split mode', {
      provider: provider.name,
      model: modelDetails.name,
      forceSingleMessageEnabled: ollamaForceSingleMessageEnabled,
      forceOllamaSingleMessageForABTest,
      automaticSplitAllowed: !forceOllamaSingleMessageForABTest,
      requiresSplitForOllamaPromptLength,
      shouldSplitBridgedSystemPrompt,
      profile: optimizedPrompt.profile.modelClass,
      bridgedPromptChars: optimizedPrompt.system.trim().length,
      splitPartChars: bridgedPromptPartChars,
      envFlagName: 'OLLAMA_BRIDGED_SYSTEM_PROMPT_SPLIT',
    });
  } else if (!allowBridgedPromptSplitting && isLocalProvider(provider.name)) {
    logger.info('Bridged system prompt splitting disabled for provider', {
      provider: provider.name,
      model: modelDetails.name,
      profile: optimizedPrompt.profile.modelClass,
    });
  }

  const modelMessages = shouldBridgeSystemPromptToMessages(provider.name)
    ? bridgeSystemPromptIntoMessages(optimizedPrompt.messages, optimizedPrompt.system, {
        splitIntoParts: shouldSplitBridgedSystemPrompt,
        maxPartChars: bridgedPromptPartChars,
      })
    : optimizedPrompt.messages;

  const isResponsesModel = isOpenAIResponsesModel(provider.name, modelDetails.name);
  const tokenParams = isReasoning ? { maxCompletionTokens: safeMaxTokens } : { maxTokens: safeMaxTokens };

  logger.info(`Preparing convertToModelMessages for ${modelMessages.length} messages`);
  logger.debug(`Messages to convert: ${JSON.stringify(modelMessages.slice(0, 2))}`);

  // Build messages with all required fields for convertToModelMessages
  const messagesToConvert = modelMessages.map((msg: any, idx: number) => ({
    id: `msg-${idx}`,
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: msg.content,
    parts: undefined, // Add parts field to satisfy Message interface
  }));

  let convertedMessages: any;

  try {
    logger.debug(`Message structure for conversion: ${JSON.stringify(messagesToConvert.slice(0, 1))}`);
    convertedMessages = await convertToModelMessages(messagesToConvert as any);
    logger.info(`Successfully converted ${convertedMessages.length} messages to model format`);
  } catch (error) {
    logger.warn(
      `convertToModelMessages failed (using fallback):`,
      error instanceof Error ? error.message : String(error),
    );

    // Fallback: if convertToModelMessages fails, use messages as-is
    logger.info(`Using raw message format as fallback for streaming`);
    convertedMessages = messagesToConvert;
  }

  const finalSystemPrompt =
    chatMode === 'build' ? `${optimizedPrompt.system}\n\n${getBuildModeExecutionContract()}` : optimizedPrompt.system;

  const streamParams = {
    model: provider.getModelInstance({
      model: modelDetails.name,
      serverEnv,
      apiKeys,
      providerSettings,
    }),
    system: finalSystemPrompt,
    ...tokenParams,
    messages: convertedMessages,
    ...filteredOptions,

    // Set temperature to 1 for reasoning models (required by OpenAI API)
    ...(isReasoning && !isResponsesModel ? { temperature: 1 } : {}),
  };

  // DEBUG: Log final streaming parameters
  logger.info(
    `DEBUG STREAM: Final streaming params for model "${modelDetails.name}":`,
    JSON.stringify(
      {
        hasTemperature: 'temperature' in streamParams,
        hasMaxTokens: 'maxTokens' in streamParams,
        hasMaxCompletionTokens: 'maxCompletionTokens' in streamParams,
        hasMaxOutputTokens: 'maxOutputTokens' in streamParams,
        paramKeys: Object.keys(streamParams).filter((key) => !['model', 'messages', 'system'].includes(key)),
        streamParams: Object.fromEntries(
          Object.entries(streamParams).filter(([key]) => !['model', 'messages', 'system'].includes(key)),
        ),
      },
      null,
      2,
    ),
  );

  try {
    logger.info(`About to call _streamText for model "${modelDetails.name}"`);

    const streamInitializationStart = Date.now();
    const result = await _streamText(streamParams);
    const streamInitializationMs = Date.now() - streamInitializationStart;

    logger.info('Stream initialized', {
      model: modelDetails.name,
      provider: provider.name,
      streamInitializationMs,
      localProvider: isLocalProvider(provider.name),
      messageCount: convertedMessages.length,
    });

    if (streamInitializationMs > 5000) {
      logger.warn('Slow stream initialization detected', {
        model: modelDetails.name,
        provider: provider.name,
        streamInitializationMs,
        localProvider: isLocalProvider(provider.name),
      });
    }

    logger.info(`_streamText returned successfully for model "${modelDetails.name}"`);

    return result;
  } catch (error) {
    logger.error(`_streamText failed for model "${modelDetails.name}":`, error);
    throw error;
  }
}
