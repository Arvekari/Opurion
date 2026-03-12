import { describe, expect, it, vi } from 'vitest';

vi.mock('~/lib/modules/llm/base-provider', () => ({
  BaseProvider: class {
    convertEnvToRecord(env?: Record<string, unknown>) {
      return (env || {}) as Record<string, string>;
    }

    getProviderBaseUrlAndKey() {
      return { baseUrl: 'http://127.0.0.1:11434', apiKey: undefined };
    }

    resolveDockerUrl(baseUrl: string) {
      return baseUrl;
    }
  },
}));

const chatModelMock = vi.fn(() => ({ specificationVersion: 'v2' }));
const createOpenAIMock = vi.fn(() => ({
  chat: chatModelMock,
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: createOpenAIMock,
}));

describe('providers/ollama module', () => {
  it('loads exports', async () => {
    const module = await import('~/lib/modules/llm/providers/ollama');
    expect(module.default).toBeDefined();
  });

  it('uses OpenAI chat endpoint for model instances', async () => {
    const module = await import('~/lib/modules/llm/providers/ollama');
    const Provider = module.default;
    const provider = new Provider();

    provider.getModelInstance({
      model: 'deepseek-coder:6.7b',
      serverEnv: {} as any,
      apiKeys: {},
      providerSettings: {},
    });

    expect(createOpenAIMock).toHaveBeenCalled();
    expect(chatModelMock).toHaveBeenCalledWith('deepseek-coder:6.7b');
  });
});