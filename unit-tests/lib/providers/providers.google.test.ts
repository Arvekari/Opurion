import { describe, expect, it, vi } from 'vitest';

const { googleModelMock, createGoogleMock } = vi.hoisted(() => ({
  googleModelMock: vi.fn(() => ({ kind: 'google-model' })),
  createGoogleMock: vi.fn(() => {
    const client: any = (model: string) => googleModelMock(model);
    return client;
  }),
}));

vi.mock('~/lib/modules/llm/base-provider', () => ({
  BaseProvider: class {},
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: createGoogleMock,
}));

describe('providers/google module', () => {
  it('loads exports', async () => {
    const module = await import('~/lib/modules/llm/providers/google');
    expect(module.default).toBeDefined();
  });

  it('creates model instance using google factory', async () => {
    const module = await import('~/lib/modules/llm/providers/google');
    const provider = new module.default() as any;
    provider.getProviderBaseUrlAndKey = vi.fn(() => ({ apiKey: 'google-key' }));

    provider.getModelInstance({
      model: 'gemini-1.5-pro',
      serverEnv: {} as any,
      apiKeys: {},
      providerSettings: {},
    });

    expect(createGoogleMock).toHaveBeenCalledWith({ apiKey: 'google-key' });
    expect(googleModelMock).toHaveBeenCalledWith('gemini-1.5-pro');
  });

  it('filters and maps dynamic models from Google endpoint response', async () => {
    const module = await import('~/lib/modules/llm/providers/google');
    const provider = new module.default() as any;
    provider.getProviderBaseUrlAndKey = vi.fn(() => ({ apiKey: 'google-key' }));

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        models: [
          {
            name: 'models/gemini-2.0-flash',
            displayName: 'Gemini 2.0 Flash',
            inputTokenLimit: 1000000,
            outputTokenLimit: 12000,
          },
          {
            name: 'models/gemini-exp-1206',
            displayName: 'Gemini Exp',
            inputTokenLimit: 1000000,
            outputTokenLimit: 12000,
          },
          {
            name: 'models/gemini-1.5-pro',
            displayName: 'Gemini 1.5 Pro',
            inputTokenLimit: 2000000,
            outputTokenLimit: 8192,
          },
        ],
      }),
    }));

    const previousFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as any;

    try {
      const models = await provider.getDynamicModels({}, {}, {});
      expect(models.some((m: any) => m.name === 'gemini-2.0-flash')).toBe(true);
      expect(models.some((m: any) => m.name === 'gemini-exp-1206')).toBe(false);
      expect(models.some((m: any) => m.name === 'gemini-1.5-pro')).toBe(true);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});