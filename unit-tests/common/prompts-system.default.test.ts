import { describe, expect, it } from 'vitest';
import { getSystemPrompt } from '~/lib/common/prompts/prompts';

describe('getSystemPrompt default', () => {
  it('returns base prompt content', () => {
    const prompt = getSystemPrompt();
    expect(prompt).toContain('You are Bolt');
    expect(prompt).toContain('system_constraints');
    expect(prompt).toContain('MUST respond with exactly one <boltArtifact>');
  });
});
