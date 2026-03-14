import { describe, expect, it } from 'vitest';

describe('lib/hooks/useDataOperations', () => {
  it('exports the hook module at the mapped baseline test path', async () => {
    const module = await import('~/lib/hooks/useDataOperations');

    expect(module.useDataOperations).toBeTypeOf('function');
  });
});