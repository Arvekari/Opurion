import { describe, expect, it, vi } from 'vitest';

const { mistralModelMock, createMistralMock } = vi.hoisted(() => ({
  mistralModelMock: vi.fn(() => ({ kind: 'mistral-model' })),
  createMistralMock: vi.fn(() => {
    const client: any = (model: string) => mistralModelMock(model);
    return client;
  }),
}));

vi.mock('~/lib/modules/llm/base-provider', () => ({
  BaseProvider: class {},
}));

vi.mock('@ai-sdk/mistral', () => ({
  createMistral: createMistralMock,
}));

describe('providers/mistral module', () => {
  it('loads exports', async () => {
    const module = await import('~/lib/modules/llm/providers/mistral');
    expect(module.default).toBeDefined();
  });

  it('creates model instance using mistral factory', async () => {
    const module = await import('~/lib/modules/llm/providers/mistral');
    const provider = new module.default() as any;
    provider.getProviderBaseUrlAndKey = vi.fn(() => ({ apiKey: 'mistral-key' }));

    provider.getModelInstance({
      model: 'mistral-large-latest',
      serverEnv: {} as any,
      apiKeys: {},
      providerSettings: {},
    });

    expect(createMistralMock).toHaveBeenCalledWith({ apiKey: 'mistral-key' });
    expect(mistralModelMock).toHaveBeenCalledWith('mistral-large-latest');
  });
});