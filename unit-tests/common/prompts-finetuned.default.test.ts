import { describe, expect, it } from 'vitest';
import { getFineTunedPrompt } from '~/lib/common/prompts/new-prompt';

describe('getFineTunedPrompt default', () => {
  it('returns baseline fine-tuned prompt', () => {
    const prompt = getFineTunedPrompt();
    expect(prompt).toContain('You are Opurion');
    expect(prompt).toContain('The year is 2026');
    expect(prompt).toContain('MUST respond with exactly one <boltArtifact>');
  });

  it('translates premium UI language into concrete design obligations', () => {
    const prompt = getFineTunedPrompt();

    expect(prompt).toContain('Intent Translation Rules');
    expect(prompt).toContain('modern", "premium", "luxury", "graphical", "high-end", "slick", or "wow"');
    expect(prompt).toContain('do NOT generate a sparse white page with one card');
    expect(prompt).toContain('No placeholder labels such as "Logo placeholder", "Gallery", or "No items yet"');
  });
});
