import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoltChatTransport } from '~/lib/chat/boltChatTransport';

describe('app/lib/chat/boltChatTransport.ts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('surfaces empty response streams as an explicit error chunk', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
      ),
    );

    vi.stubGlobal('fetch', fetchMock);

    const transport = new BoltChatTransport('/api/chat', () => ({}));
    const stream = await transport.sendMessages({
      messages: [{ id: 'm1', role: 'user', content: 'hello' }],
    });

    const reader = stream.getReader();
    const chunks: Array<Record<string, unknown>> = [];

    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      chunks.push(value);
    }

    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'error',
        errorText: expect.stringContaining('before any content was received'),
      }),
    );
    expect(chunks.at(-1)).toEqual(expect.objectContaining({ type: 'finish', finishReason: 'error' }));
  });

  it('fails with a retryable error when the chat endpoint never produces a first byte', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );

    vi.stubGlobal('fetch', fetchMock);

    const transport = new BoltChatTransport('/api/chat', () => ({}));
    const sendPromise = transport.sendMessages({
      messages: [{ id: 'm1', role: 'user', content: 'hello' }],
    });
    const expectation = expect(sendPromise).rejects.toThrow(/first-byte-timeout|response timeout|504/i);

    await vi.advanceTimersByTimeAsync(45000);

    await expectation;

    vi.useRealTimers();
  });
});
