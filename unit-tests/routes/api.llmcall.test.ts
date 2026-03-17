import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  streamTextMock,
  generateTextMock,
  updateModelListMock,
  getModelInstanceMock,
  isReasoningModelMock,
} = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
  generateTextMock: vi.fn(),
  updateModelListMock: vi.fn(),
  getModelInstanceMock: vi.fn(() => 'mock-model-instance'),
  isReasoningModelMock: vi.fn(() => false),
}));

vi.mock('~/lib/.server/llm/stream-text', () => ({
  streamText: streamTextMock,
  isOpenAIResponsesModel: vi.fn((provider: string, model: string) => provider === 'OpenAI' && /codex/i.test(model)),
}));

vi.mock('ai', () => ({
  generateText: generateTextMock,
}));

vi.mock('~/lib/modules/llm/manager', () => ({
  LLMManager: {
    getInstance: vi.fn(() => ({
      updateModelList: updateModelListMock,
      getProvider: vi.fn(() => ({ getModelInstance: getModelInstanceMock })),
    })),
  },
}));

vi.mock('~/lib/api/cookies', () => ({
  resolveApiKeys: vi.fn(async () => ({ OpenAI: 'token' })),
  resolveProviderSettings: vi.fn(async () => ({ OpenAI: { enabled: true } })),
}));

vi.mock('~/utils/constants', () => ({
  PROVIDER_LIST: [
    {
      name: 'OpenAI',
      getModelInstance: getModelInstanceMock,
    },
  ],
}));

vi.mock('~/lib/.server/llm/constants', () => ({
  MAX_TOKENS: 4096,
  PROVIDER_COMPLETION_LIMITS: { OpenAI: 1024 },
  isReasoningModel: isReasoningModelMock,
}));

vi.mock('~/utils/logger', () => ({
  createScopedLogger: vi.fn(() => ({
    info: vi.fn(),
  })),
}));

import { action } from '~/routes/api.llmcall';

describe('/api/llmcall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateModelListMock.mockResolvedValue([
      {
        name: 'gpt-test',
        provider: 'OpenAI',
        maxTokenAllowed: 4096,
        maxCompletionTokens: 512,
      },
    ]);
  });

  it('throws 400 response when model is missing', async () => {
    const call = action({
      request: new Request('http://localhost/api/llmcall', {
        method: 'POST',
        body: JSON.stringify({
          system: 'sys',
          message: 'hello',
          model: '',
          provider: { name: 'OpenAI' },
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
      context: { cloudflare: { env: {} } },
    } as any);

    await expect(call).rejects.toMatchObject({ status: 400 });
  });

  it('returns streamed text response when streamOutput is true', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('hello-stream'));
        controller.close();
      },
    });
    streamTextMock.mockResolvedValue({ textStream: stream });

    const response = await action({
      request: new Request('http://localhost/api/llmcall', {
        method: 'POST',
        body: JSON.stringify({
          system: 'sys',
          message: 'hello',
          model: 'gpt-test',
          provider: { name: 'OpenAI' },
          streamOutput: true,
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
      context: { cloudflare: { env: {} } },
    } as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/plain');
  });

  it('returns json response for non-stream call', async () => {
    generateTextMock.mockResolvedValue({ text: 'generated' });

    const response = await action({
      request: new Request('http://localhost/api/llmcall', {
        method: 'POST',
        body: JSON.stringify({
          system: 'sys',
          message: 'hello',
          model: 'gpt-test',
          provider: { name: 'OpenAI' },
          streamOutput: false,
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
      context: { cloudflare: { env: {} } },
    } as any);

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.text).toBe('generated');
    expect(generateTextMock).toHaveBeenCalled();
  });

  it('uses maxOutputTokens for codex responses models', async () => {
    updateModelListMock.mockResolvedValue([
      {
        name: 'gpt-5.3-codex',
        provider: 'OpenAI',
        maxTokenAllowed: 128000,
        maxCompletionTokens: 64000,
      },
    ]);
    isReasoningModelMock.mockReturnValue(true);
    generateTextMock.mockResolvedValue({ text: 'generated' });

    const response = await action({
      request: new Request('http://localhost/api/llmcall', {
        method: 'POST',
        body: JSON.stringify({
          system: 'sys',
          message: 'hello',
          model: 'gpt-5.3-codex',
          provider: { name: 'OpenAI' },
          streamOutput: false,
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
      context: { cloudflare: { env: {} } },
    } as any);

    expect(response.status).toBe(200);
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 64000,
      }),
    );

    const calledParams = generateTextMock.mock.calls[0][0];
    expect(calledParams.maxTokens).toBeUndefined();
    expect(calledParams.maxCompletionTokens).toBeUndefined();
    expect(calledParams.temperature).toBeUndefined();
  });

  it('keeps maxTokens and temperature for gpt-4o chat models', async () => {
    updateModelListMock.mockResolvedValue([
      {
        name: 'gpt-4o',
        provider: 'OpenAI',
        maxTokenAllowed: 128000,
        maxCompletionTokens: 4096,
      },
    ]);
    isReasoningModelMock.mockReturnValue(false);
    generateTextMock.mockResolvedValue({ text: 'generated' });

    const response = await action({
      request: new Request('http://localhost/api/llmcall', {
        method: 'POST',
        body: JSON.stringify({
          system: 'sys',
          message: 'hello',
          model: 'gpt-4o',
          provider: { name: 'OpenAI' },
          streamOutput: false,
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
      context: { cloudflare: { env: {} } },
    } as any);

    expect(response.status).toBe(200);
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 4096,
        temperature: 0,
      }),
    );
  });
});
