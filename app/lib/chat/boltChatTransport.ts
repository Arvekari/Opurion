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

/**
 * Converts a ReadableStream of v2 data-stream bytes into a ReadableStream of
 * UIMessageChunks that v3 @ai-sdk/react can consume.
 */
function buildUIMessageChunkStream(byteStream: ReadableStream<Uint8Array>): ReadableStream<Record<string, unknown>> {
  const decoder = new TextDecoder();
  let buffer = '';
  const textId = 'text-1';
  let textStarted = false;

  const transform = new TransformStream<Uint8Array, Record<string, unknown>>({
    start(controller) {
      controller.enqueue({ type: 'start' });
      controller.enqueue({ type: 'start-step' });
    },

    transform(chunk, controller) {
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
    // Convert v3 UIMessages to the v2 format the backend expects
    const v2Messages = options.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: extractTextContent(m as { content?: string; parts?: Array<{ type: string; text?: string }> }),
    }));

    const requestBody: Record<string, unknown> = {
      messages: v2Messages,
      ...this.getBody(),
      ...(options.body ?? {}),
    };

    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
      body: JSON.stringify(requestBody),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(`Chat request failed (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Chat API returned no response body');
    }

    return buildUIMessageChunkStream(response.body);
  }
}
