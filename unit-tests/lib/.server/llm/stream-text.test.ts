import { describe, expect, it } from 'vitest';

import {
  bridgeSystemPromptIntoMessages,
  hasToolDefinitions,
  isOpenAIResponsesModel,
  isToolCallingDisabledForProvider,
  shouldBridgeSystemPromptToMessages,
} from '~/lib/.server/llm/stream-text';

describe('lib/.server/llm/stream-text baseline', () => {
  it('exposes helper behavior for tool definitions', () => {
    expect(hasToolDefinitions({})).toBe(false);
    expect(hasToolDefinitions({ toolA: {} })).toBe(true);
  });

  it('keeps tool-calling enabled by default for providers', () => {
    expect(isToolCallingDisabledForProvider('OpenAI')).toBe(false);
    expect(isToolCallingDisabledForProvider('Anthropic')).toBe(false);
  });

  it('detects OpenAI responses models for codex variants only', () => {
    expect(isOpenAIResponsesModel('OpenAI', 'gpt-5.3-codex')).toBe(true);
    expect(isOpenAIResponsesModel('OpenAI', 'gpt-4o')).toBe(false);
    expect(isOpenAIResponsesModel('Anthropic', 'claude-3-5-sonnet')).toBe(false);
  });

  it('enables system prompt bridging for local providers only', () => {
    expect(shouldBridgeSystemPromptToMessages('Ollama')).toBe(true);
    expect(shouldBridgeSystemPromptToMessages('LMStudio')).toBe(true);
    expect(shouldBridgeSystemPromptToMessages('OpenAILike')).toBe(true);
    expect(shouldBridgeSystemPromptToMessages('OpenAI')).toBe(false);
  });

  it('mirrors system directives into the first user message', () => {
    const bridged = bridgeSystemPromptIntoMessages(
      [
        { role: 'user', content: 'Build an introduction page' },
        { role: 'assistant', content: 'Previous answer' },
      ],
      'Use the narrative. Respond with a bolt artifact.',
    );

    expect(bridged[0].content).toContain('<system_directives>');
    expect(bridged[0].content).toContain('Use the narrative.');
    expect(bridged[0].content).toContain('Build an introduction page');
    expect(bridged[1].content).toBe('Previous answer');
  });

  it('can split bridged system directives into multiple parts for smaller local models', () => {
    const partOne = `part one ${'a'.repeat(220)}`;
    const partTwo = `part two ${'b'.repeat(220)}`;
    const partThree = `part three ${'c'.repeat(220)}`;

    const bridged = bridgeSystemPromptIntoMessages(
      [{ role: 'user', content: 'Create the landing page' }],
      [partOne, partTwo, partThree].join('\n\n'),
      { splitIntoParts: true, maxPartChars: 200 },
    );

    const directivePartCount = (bridged[0].content.match(/<directive_part /g) || []).length;

    expect(directivePartCount).toBeGreaterThanOrEqual(3);
    expect(bridged[0].content).toContain('Read every directive_part above as one instruction set.');
    expect(bridged[0].content).toContain('Create the landing page');
  });

  it('caps bridged directive parts to provider-safe maximum', () => {
    const longPrompt = Array.from({ length: 18 }, (_, index) => `section ${index + 1}\n${'x'.repeat(180)}`).join('\n\n');

    const bridged = bridgeSystemPromptIntoMessages(
      [{ role: 'user', content: 'Implement the requested changes' }],
      longPrompt,
      { splitIntoParts: true, maxPartChars: 120 },
    );

    const directivePartCount = (bridged[0].content.match(/<directive_part /g) || []).length;

    expect(directivePartCount).toBeLessThanOrEqual(5);
    expect(bridged[0].content).not.toContain('index="6"');
  });
});
