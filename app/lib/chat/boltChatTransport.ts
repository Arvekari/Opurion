/**
 * BoltChatTransport — v3 @ai-sdk/react ChatTransport implementation
 * that bridges the v3 SDK frontend with the v2 data-stream backend protocol.
 *
 * The backend (/api/chat) produces lines in the v2 "data stream" format, e.g.:
 *   0:"hello world"\n  (text chunk)
 *   2:[{json}]\n       (data annotation)
 *   8:[{annotation}]\n (message annotation)
 *   e:{finish_step}\n  (finish step)
 *   d:{finish_msg}\n   (finish message)
 *
 * The v3 SDK expects a ReadableStream<UIMessageChunk> from sendMessages.
 * This transport converts between the two formats.
 */

import { parseDataStreamPart } from '@ai-sdk/ui-utils';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('BoltChatTransport');
const DEFAULT_FIRST_BYTE_WARNING_MS = 15000;
const LOCAL_PROVIDER_FIRST_BYTE_WARNING_MS = 45000;
const DEFAULT_FIRST_BYTE_TIMEOUT_MS = 45000;
const LOCAL_PROVIDER_FIRST_BYTE_TIMEOUT_MS = 120000;

const LOCAL_PROVIDER_NAMES = new Set(['Ollama', 'LMStudio', 'OpenAILike']);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFetchNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    error.name === 'TypeError' &&
    (message.includes('network error') || message.includes('failed to fetch') || message.includes('fetch failed'))
  );
}

function serializeTransportError(params: {
  endpoint: string;
  selectedProviderName?: string;
  requestStartedAtMs: number;
  cause: unknown;
  abortSignal?: AbortSignal;
}): string {
  const cause = params.cause instanceof Error ? params.cause : new Error(String(params.cause));
  const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
  const online = typeof navigator !== 'undefined' ? navigator.onLine : undefined;

  return JSON.stringify({
    message: `Network error reaching chat endpoint (${params.endpoint}).`,
    error: 'Chat transport network failure',
    statusCode: 503,
    provider: params.selectedProviderName,
    type: 'network',
    isRetryable: true,
    diagnostics: {
      endpoint: params.endpoint,
      origin,
      online,
      aborted: Boolean(params.abortSignal?.aborted),
      elapsedMs: Date.now() - params.requestStartedAtMs,
      causeName: cause.name,
      causeMessage: cause.message,
    },
  });
}

function serializeTransportTimeoutError(params: {
  endpoint: string;
  selectedProviderName?: string;
  requestStartedAtMs: number;
  timeoutMs: number;
}) {
  return JSON.stringify({
    message: `Chat endpoint did not produce a response within ${params.timeoutMs}ms.`,
    error: 'Chat transport response timeout',
    statusCode: 504,
    provider: params.selectedProviderName,
    type: 'network',
    isRetryable: true,
    diagnostics: {
      endpoint: params.endpoint,
      elapsedMs: Date.now() - params.requestStartedAtMs,
      timeoutMs: params.timeoutMs,
      phase: 'first-byte-timeout',
    },
  });
}

function getFirstByteWarningMs(providerName?: string): number {
  if (providerName && LOCAL_PROVIDER_NAMES.has(providerName)) {
    return LOCAL_PROVIDER_FIRST_BYTE_WARNING_MS;
  }

  return DEFAULT_FIRST_BYTE_WARNING_MS;
}

function getFirstByteTimeoutMs(providerName?: string): number {
  if (providerName && LOCAL_PROVIDER_NAMES.has(providerName)) {
    return LOCAL_PROVIDER_FIRST_BYTE_TIMEOUT_MS;
  }

  return DEFAULT_FIRST_BYTE_TIMEOUT_MS;
}

function extractTextContent(message: { content?: string; parts?: Array<{ type: string; text?: string }> }): string {
  if (typeof message.content === 'string' && message.content.length > 0) {
    return message.content;
  }
  if (Array.isArray(message.parts)) {
    return message.parts
      .filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join('');
  }
  return '';
}

function createClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Converts a ReadableStream of v2 data-stream bytes into a ReadableStream of
 * UIMessageChunks that v3 @ai-sdk/react can consume.
 */
function buildUIMessageChunkStream(
  byteStream: ReadableStream<Uint8Array>,
  diagnostics?: {
    onFirstChunk?: () => void;
    onStreamEndedWithoutChunks?: () => void;
  },
): ReadableStream<Record<string, unknown>> {
  const decoder = new TextDecoder();
  let buffer = '';
  const textId = 'text-1';
  let textStarted = false;
  let hasReceivedChunk = false;

  const transform = new TransformStream<Uint8Array, Record<string, unknown>>({
    start(controller) {
      controller.enqueue({ type: 'start' });
      controller.enqueue({ type: 'start-step' });
    },

    transform(chunk, controller) {
      if (!hasReceivedChunk) {
        hasReceivedChunk = true;
        diagnostics?.onFirstChunk?.();
      }

      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        try {
          const { type, value } = parseDataStreamPart(line);

          switch (type) {
            case 'text':
              if (!textStarted) {
                textStarted = true;
                controller.enqueue({ type: 'text-start', id: textId });
              }
              controller.enqueue({ type: 'text-delta', id: textId, delta: value });
              break;

            case 'data':
              controller.enqueue({ type: 'message-metadata', messageMetadata: { data: value } });
              break;

            case 'message_annotations':
              controller.enqueue({ type: 'message-metadata', messageMetadata: { annotations: value } });
              break;

            case 'error':
              controller.enqueue({ type: 'error', errorText: String(value) });
              break;

            // finish_message, finish_step — handled in flush
            default:
              break;
          }
        } catch {
          // Ignore malformed lines
        }
      }
    },

    flush(controller) {
      if (!hasReceivedChunk) {
        diagnostics?.onStreamEndedWithoutChunks?.();
        controller.enqueue({
          type: 'error',
          errorText: 'Chat response ended before any content was received. Please retry the request.',
        });
        controller.enqueue({ type: 'finish-step' });
        controller.enqueue({ type: 'finish', finishReason: 'error' });
        return;
      }

      // Process any remaining buffered content
      if (buffer.trim()) {
        try {
          const { type, value } = parseDataStreamPart(buffer);

          if (type === 'text') {
            if (!textStarted) {
              textStarted = true;
              controller.enqueue({ type: 'text-start', id: textId });
            }
            controller.enqueue({ type: 'text-delta', id: textId, delta: value });
          }
        } catch {
          // Ignore
        }
      }

      if (textStarted) {
        controller.enqueue({ type: 'text-end', id: textId });
      }

      controller.enqueue({ type: 'finish-step' });
      controller.enqueue({ type: 'finish', finishReason: 'stop' });
    },
  });

  return byteStream.pipeThrough(transform);
}

/**
 * ChatTransport implementation for Bolt's v2-protocol backend.
 *
 * Usage:
 *   const transport = new BoltChatTransport('/api/chat', () => chatBodyRef.current);
 *   useChat({ transport, messages: initialMessages, ... })
 */
export class BoltChatTransport {
  private readonly apiEndpoint: string;
  private readonly getBody: () => Record<string, unknown>;

  constructor(apiEndpoint: string, getBody: () => Record<string, unknown>) {
    this.apiEndpoint = apiEndpoint;
    this.getBody = getBody;
  }

  async sendMessages(options: {
    messages: Array<{ id?: string; role: string; content?: string; parts?: Array<{ type: string; text?: string }> }>;
    abortSignal?: AbortSignal;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
    chatId?: string;
    metadata?: unknown;
    trigger?: string;
    messageId?: string;
  }): Promise<ReadableStream<Record<string, unknown>>> {
    const requestStartedAtMs = Date.now();
    const clientRequestId =
      typeof options.body?.clientRequestId === 'string' && options.body.clientRequestId.length > 0
        ? (options.body.clientRequestId as string)
        : createClientRequestId();

    // Convert v3 UIMessages to the v2 format the backend expects
    const v2Messages = options.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: extractTextContent(m as { content?: string; parts?: Array<{ type: string; text?: string }> }),
    }));

    const requestBody: Record<string, unknown> = {
      messages: v2Messages,
      clientRequestId,
      ...this.getBody(),
      ...(options.body ?? {}),
    };

    const selectedProviderName =
      typeof requestBody.selectedProviderName === 'string' ? (requestBody.selectedProviderName as string) : undefined;
    const firstByteWarningMs = getFirstByteWarningMs(selectedProviderName);
    const firstByteTimeoutMs = getFirstByteTimeoutMs(selectedProviderName);

    logger.info('Chat request started', {
      endpoint: this.apiEndpoint,
      clientRequestId,
      messageCount: v2Messages.length,
      hasAbortSignal: Boolean(options.abortSignal),
      selectedProviderName,
      firstByteWarningMs,
      firstByteTimeoutMs,
    });

    let firstByteTimer: ReturnType<typeof setTimeout> | undefined;
    let firstByteTimeoutTimer: ReturnType<typeof setTimeout> | undefined;
    let abortHandler: (() => void) | undefined;
    let hasReceivedFirstByte = false;
    let firstByteTimedOut = false;
    const requestAbortController = new AbortController();

    const abortRequest = () => {
      if (!requestAbortController.signal.aborted) {
        requestAbortController.abort();
      }
    };

    const clearFirstByteTimer = () => {
      if (firstByteTimer) {
        clearTimeout(firstByteTimer);
        firstByteTimer = undefined;
      }

      if (firstByteTimeoutTimer) {
        clearTimeout(firstByteTimeoutTimer);
        firstByteTimeoutTimer = undefined;
      }
    };

    const markFirstByte = () => {
      if (hasReceivedFirstByte) {
        return;
      }

      hasReceivedFirstByte = true;
      clearFirstByteTimer();
      logger.info('First response byte received', {
        endpoint: this.apiEndpoint,
        clientRequestId,
        elapsedMs: Date.now() - requestStartedAtMs,
      });

      if (options.abortSignal && abortHandler) {
        options.abortSignal.removeEventListener('abort', abortHandler);
      }
    };

    firstByteTimer = setTimeout(() => {
      if (hasReceivedFirstByte || options.abortSignal?.aborted) {
        return;
      }

      logger.warn('No response bytes received within first-byte threshold', {
        endpoint: this.apiEndpoint,
        selectedProviderName,
        thresholdMs: firstByteWarningMs,
        elapsedMs: Date.now() - requestStartedAtMs,
      });
    }, firstByteWarningMs);

    firstByteTimeoutTimer = setTimeout(() => {
      if (hasReceivedFirstByte || options.abortSignal?.aborted) {
        return;
      }

      firstByteTimedOut = true;
      logger.error('No response bytes received before timeout; aborting chat request', {
        endpoint: this.apiEndpoint,
        selectedProviderName,
        timeoutMs: firstByteTimeoutMs,
        elapsedMs: Date.now() - requestStartedAtMs,
      });
      abortRequest();
    }, firstByteTimeoutMs);

    if (options.abortSignal) {
      abortHandler = () => {
        clearFirstByteTimer();
        abortRequest();
        logger.info('Chat request aborted before first-byte completion', {
          endpoint: this.apiEndpoint,
          clientRequestId,
          elapsedMs: Date.now() - requestStartedAtMs,
          hadFirstByte: hasReceivedFirstByte,
        });
      };
      options.abortSignal.addEventListener('abort', abortHandler, { once: true });
    }

    let response: Response;

    const runFetch = async (body: Record<string, unknown>) =>
      fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Request-Id': clientRequestId,
          ...(options.headers ?? {}),
        },
        body: JSON.stringify(body),
        signal: requestAbortController.signal,
      });

    try {
      response = await runFetch(requestBody);
    } catch (error) {
      if (firstByteTimedOut && !options.abortSignal?.aborted) {
        clearFirstByteTimer();

        if (options.abortSignal && abortHandler) {
          options.abortSignal.removeEventListener('abort', abortHandler);
        }

        throw new Error(
          serializeTransportTimeoutError({
            endpoint: this.apiEndpoint,
            selectedProviderName,
            requestStartedAtMs,
            timeoutMs: firstByteTimeoutMs,
          }),
        );
      }

      const shouldRetry =
        selectedProviderName !== undefined &&
        LOCAL_PROVIDER_NAMES.has(selectedProviderName) &&
        isFetchNetworkError(error) &&
        !options.abortSignal?.aborted &&
        !requestAbortController.signal.aborted;

      if (shouldRetry) {
        const forceSingleMessageForRequest = requestBody.ollamaBridgedSystemPromptSplit === true;
        const useAutomaticSplitFallback = selectedProviderName === 'Ollama' && forceSingleMessageForRequest;
        const retryBody = useAutomaticSplitFallback
          ? {
              ...requestBody,
              ollamaBridgedSystemPromptSplit: false,
            }
          : requestBody;

        logger.warn('Initial chat fetch failed; retrying once for local provider', {
          endpoint: this.apiEndpoint,
          clientRequestId,
          selectedProviderName,
          elapsedMs: Date.now() - requestStartedAtMs,
          automaticSplitFallbackApplied: useAutomaticSplitFallback,
        });

        await delay(600);

        try {
          response = await runFetch(retryBody);
        } catch (retryError) {
          clearFirstByteTimer();

          if (options.abortSignal && abortHandler) {
            options.abortSignal.removeEventListener('abort', abortHandler);
          }

          throw new Error(
            serializeTransportError({
              endpoint: this.apiEndpoint,
              selectedProviderName,
              requestStartedAtMs,
              cause: retryError,
              abortSignal: options.abortSignal,
            }),
          );
        }
      } else {
        clearFirstByteTimer();

        if (options.abortSignal && abortHandler) {
          options.abortSignal.removeEventListener('abort', abortHandler);
        }

        throw new Error(
          serializeTransportError({
            endpoint: this.apiEndpoint,
            selectedProviderName,
            requestStartedAtMs,
            cause: error,
            abortSignal: options.abortSignal,
          }),
        );
      }
    }

    logger.info('Chat response headers received', {
      endpoint: this.apiEndpoint,
      clientRequestId,
      status: response.status,
      elapsedMs: Date.now() - requestStartedAtMs,
    });

    if (!response.ok) {
      clearFirstByteTimer();

      if (options.abortSignal && abortHandler) {
        options.abortSignal.removeEventListener('abort', abortHandler);
      }

      const errorText = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(`Chat request failed (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      clearFirstByteTimer();

      if (options.abortSignal && abortHandler) {
        options.abortSignal.removeEventListener('abort', abortHandler);
      }

      throw new Error('Chat API returned no response body');
    }

    return buildUIMessageChunkStream(response.body, {
      onFirstChunk: markFirstByte,
      onStreamEndedWithoutChunks: () => {
        clearFirstByteTimer();

        if (options.abortSignal && abortHandler) {
          options.abortSignal.removeEventListener('abort', abortHandler);
        }

        if (!hasReceivedFirstByte) {
          logger.warn('Stream ended without response bytes', {
            endpoint: this.apiEndpoint,
            clientRequestId,
            elapsedMs: Date.now() - requestStartedAtMs,
          });
        }
      },
    });
  }
}
