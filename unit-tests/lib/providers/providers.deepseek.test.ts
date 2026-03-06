import { describe, expect, it, vi } from 'vitest';

const { deepseekModelMock, createDeepSeekMock } = vi.hoisted(() => ({
  deepseekModelMock: vi.fn(() => ({ kind: 'deepseek-model' })),
  createDeepSeekMock: vi.fn(() => {
    const client: any = (model: string) => deepseekModelMock(model);
    return client;
  }),
}));

vi.mock('~/lib/modules/llm/base-provider', () => ({
  BaseProvider: class {
    createTimeoutSignal() {
      return undefined;
    }
  },
}));

vi.mock('@ai-sdk/deepseek', () => ({
  createDeepSeek: createDeepSeekMock,
}));

describe('providers/deepseek module', () => {
  it('loads exports', async () => {
    const module = await import('~/lib/modules/llm/providers/deepseek');
    expect(module.default).toBeDefined();
  });

  it('creates model instance using deepseek factory', async () => {
    const module = await import('~/lib/modules/llm/providers/deepseek');
    const provider = new module.default() as any;
    provider.getProviderBaseUrlAndKey = vi.fn(() => ({ apiKey: 'deepseek-key' }));

    provider.getModelInstance({
      model: 'deepseek-v3.2',
      serverEnv: {} as any,
      apiKeys: {},
      providerSettings: {},
    });

    expect(createDeepSeekMock).toHaveBeenCalledWith({ apiKey: 'deepseek-key' });
    expect(deepseekModelMock).toHaveBeenCalledWith('deepseek-v3.2');
  });

  it('adds new dynamic models from DeepSeek endpoint', async () => {
    const module = await import('~/lib/modules/llm/providers/deepseek');
    const provider = new module.default() as any;
    provider.getProviderBaseUrlAndKey = vi.fn(() => ({ apiKey: 'deepseek-key' }));

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: 'deepseek-chat' },
          { id: 'deepseek-v4-beta' },
        ],
      }),
    }));

    const previousFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as any;

    try {
      const models = await provider.getDynamicModels({}, {}, {});
      expect(models).toHaveLength(1);
      expect(models[0]).toEqual(
        expect.objectContaining({
          name: 'deepseek-v4-beta',
          provider: 'Deepseek',
        }),
      );
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});