import { describe, expect, it, vi } from 'vitest';

const { cohereModelMock, createCohereMock } = vi.hoisted(() => ({
  cohereModelMock: vi.fn(() => ({ kind: 'cohere-model' })),
  createCohereMock: vi.fn(() => {
    const client: any = (model: string) => cohereModelMock(model);
    return client;
  }),
}));

vi.mock('~/lib/modules/llm/base-provider', () => ({
  BaseProvider: class {},
}));

vi.mock('@ai-sdk/cohere', () => ({
  createCohere: createCohereMock,
}));

describe('providers/cohere module', () => {
  it('loads exports', async () => {
    const module = await import('~/lib/modules/llm/providers/cohere');
    expect(module.default).toBeDefined();
  });

  it('creates model instance using cohere factory', async () => {
    const module = await import('~/lib/modules/llm/providers/cohere');
    const provider = new module.default() as any;
    provider.getProviderBaseUrlAndKey = vi.fn(() => ({ apiKey: 'cohere-key' }));

    provider.getModelInstance({
      model: 'command-r-plus-08-2024',
      serverEnv: {} as any,
      apiKeys: {},
      providerSettings: {},
    });

    expect(createCohereMock).toHaveBeenCalledWith({ apiKey: 'cohere-key' });
    expect(cohereModelMock).toHaveBeenCalledWith('command-r-plus-08-2024');
  });
});