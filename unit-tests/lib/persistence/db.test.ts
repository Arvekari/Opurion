import { describe, expect, it } from 'vitest';

describe('lib/persistence/db', () => {
  it('exports persistence helpers at the mapped baseline test path', async () => {
    const module = await import('~/lib/persistence/db');

    expect(module.setMessages).toBeTypeOf('function');
    expect(module.resolveUniqueUrlId).toBeTypeOf('function');
    expect(module.getMessages).toBeTypeOf('function');
  });
});