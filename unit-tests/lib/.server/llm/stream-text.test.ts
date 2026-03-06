import { describe, expect, it } from 'vitest';

import { hasToolDefinitions, isToolCallingDisabledForProvider } from '~/lib/.server/llm/stream-text';

describe('lib/.server/llm/stream-text baseline', () => {
  it('exposes helper behavior for tool definitions', () => {
    expect(hasToolDefinitions({})).toBe(false);
    expect(hasToolDefinitions({ toolA: {} })).toBe(true);
  });

  it('keeps tool-calling enabled by default for providers', () => {
    expect(isToolCallingDisabledForProvider('OpenAI')).toBe(false);
    expect(isToolCallingDisabledForProvider('Anthropic')).toBe(false);
  });
});
