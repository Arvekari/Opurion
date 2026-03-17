import { describe, expect, it } from 'vitest';
import type { Message } from 'ai';
import { deriveChatTitleFromMessages, extractMessageText } from '~/lib/persistence/chatTitle';

function createMessage(overrides: Partial<Message>): Message {
  return {
    id: overrides.id || 'm1',
    role: overrides.role || 'user',
    content: overrides.content || '',
    ...overrides,
  } as Message;
}

describe('persistence/chatTitle', () => {
  it('derives the title from the first assistant markdown header when available', () => {
    const title = deriveChatTitleFromMessages([
      createMessage({ role: 'user', content: 'Build an Expo app for field inspections with offline sync and photo uploads' }),
      createMessage({ role: 'assistant', content: '# Field Inspection App with Offline Sync\n\nTopic details...' }),
    ]);

    expect(title).toBe('Field Inspection App with Offline Sync');
  });

  it('derives the title from boltArtifact title in the first assistant response', () => {
    const title = deriveChatTitleFromMessages([
      createMessage({ role: 'user', content: 'Create multilingual beauty website' }),
      createMessage({
        role: 'assistant',
        content:
          '<boltArtifact id="app" title="Sahar Beauty Premium Multilingual Web Application" type="bundled">...</boltArtifact>',
      }),
    ]);

    expect(title).toBe('Sahar Beauty Premium Multilingual Web Application');
  });

  it('removes markup and truncates long prompts', () => {
    const title = deriveChatTitleFromMessages([
      createMessage({
        role: 'user',
        content:
          '<context>selected</context> Build a secure admin dashboard with audit logs, RBAC, SSO, detailed analytics, export flows, and environment health checks for multi-tenant operations',
      }),
    ]);

    expect(title).toBe('selected Build a secure admin dashboard with audit logs, RBAC, SSO, detailed...');
  });

  it('reads v3 text parts when content is empty', () => {
    const message = createMessage({
      content: '',
      parts: [
        { type: 'text', text: 'Plan a CRM migration for 50 sales reps' },
        { type: 'tool-invocation' } as any,
      ],
    });

    expect(extractMessageText(message)).toBe('Plan a CRM migration for 50 sales reps');
    expect(deriveChatTitleFromMessages([message])).toBe('Plan a CRM migration for 50 sales reps');
  });

  it('falls back to the artifact title when no usable user prompt exists', () => {
    const title = deriveChatTitleFromMessages(
      [createMessage({ role: 'assistant', content: 'artifact output', annotations: ['no-store'] as any })],
      'Generated project scaffold',
    );

    expect(title).toBe('Generated project scaffold');
  });
});
