import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  streamTextMock,
  generateTextMock,
  updateModelListMock,
  getModelInstanceMock,
  getProviderMock,
  isReasoningModelMock,
} = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
  generateTextMock: vi.fn(),
  updateModelListMock: vi.fn(),
  getModelInstanceMock: vi.fn(() => 'model-instance'),
  getProviderMock: vi.fn(() => ({ getModelInstance: vi.fn(() => 'model-instance') })),
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
      getProvider: getProviderMock,
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

describe('/api/llmcall error handling', () => {
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

  it('throws unauthorized response for stream API key errors', async () => {
    streamTextMock.mockRejectedValue(new Error('API key missing'));

    const call = action({
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

    await expect(call).rejects.toMatchObject({ status: 401 });
  });

  it('returns token-limit response when generateText throws token error', async () => {
    generateTextMock.mockRejectedValue(new Error('max_tokens exceeds allowed limit'));

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

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe(true);
  });

  it('returns error response when provider is not found', async () => {
    updateModelListMock.mockResolvedValue([
      {
        name: 'gpt-test',
        provider: 'OpenAI',
        maxTokenAllowed: 4096,
        maxCompletionTokens: 512,
      },
    ]);

    const { PROVIDER_LIST } = await import('~/utils/constants');
    (PROVIDER_LIST as any[]).splice(0, PROVIDER_LIST.length);
    getProviderMock.mockReturnValueOnce(null);

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

    expect(response.status).toBe(500);
  });
});
