import { describe, expect, it, vi } from 'vitest';

const { anthropicModelMock, createAnthropicMock } = vi.hoisted(() => ({
  anthropicModelMock: vi.fn(() => ({ kind: 'anthropic-model' })),
  createAnthropicMock: vi.fn(() => {
    const client: any = (model: string) => anthropicModelMock(model);
    return client;
  }),
}));

vi.mock('~/lib/modules/llm/base-provider', () => ({
  BaseProvider: class {},
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: createAnthropicMock,
}));

describe('providers/anthropic module', () => {
  it('loads exports', async () => {
    const module = await import('~/lib/modules/llm/providers/anthropic');
    expect(module.default).toBeDefined();
  });

  it('creates model instance using anthropic factory', async () => {
    const module = await import('~/lib/modules/llm/providers/anthropic');
    const provider = new module.default() as any;
    provider.getProviderBaseUrlAndKey = vi.fn(() => ({ apiKey: 'anthropic-key' }));

    provider.getModelInstance({
      model: 'claude-3-5-sonnet-20241022',
      serverEnv: {} as any,
      apiKeys: {},
      providerSettings: {},
    });

    expect(createAnthropicMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'anthropic-key',
      }),
    );
    expect(anthropicModelMock).toHaveBeenCalledWith('claude-3-5-sonnet-20241022');
  });

  it('parses dynamic models and excludes static model ids', async () => {
    const module = await import('~/lib/modules/llm/providers/anthropic');
    const provider = new module.default() as any;
    provider.getProviderBaseUrlAndKey = vi.fn(() => ({ apiKey: 'anthropic-key' }));

    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        data: [
          { id: 'claude-3-5-sonnet-20241022', type: 'model', display_name: 'Claude 3.5 Sonnet' },
          { id: 'claude-sonnet-4-20250514', type: 'model', display_name: 'Claude Sonnet 4', max_tokens: 200000 },
          { id: 'not-a-model', type: 'other', display_name: 'Other' },
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
          name: 'claude-sonnet-4-20250514',
          maxTokenAllowed: 200000,
          maxCompletionTokens: 64000,
        }),
      );
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});