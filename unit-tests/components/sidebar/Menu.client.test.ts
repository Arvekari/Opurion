import { describe, expect, it } from 'vitest';
import {
  dedupeAccidentalHistoryCopies,
  ensureDistinctChatNames,
  normalizeHistoryItemsForSidebar,
} from '../../../app/components/sidebar/Menu.client';

describe('app/components/sidebar/Menu.client.tsx', () => {
  it('collapses accidental sidebar duplicates with identical visible chat content', () => {
    const items = [
      {
        id: '1',
        urlId: 'chat-1',
        description: 'Release plan',
        timestamp: '2026-03-17T09:00:00.000Z',
        metadata: undefined,
        messages: [
          { id: 'm1', role: 'user', content: 'plan release', parts: [] },
          { id: 'm2', role: 'assistant', content: 'Here is the plan', parts: [] },
        ],
      },
      {
        id: '2',
        urlId: 'chat-2',
        description: 'Release plan',
        timestamp: '2026-03-17T09:05:00.000Z',
        metadata: undefined,
        messages: [
          { id: 'x1', role: 'user', content: 'plan release', parts: [] },
          { id: 'x2', role: 'assistant', content: 'Here is the plan', parts: [] },
        ],
      },
    ] as any;

    const result = dedupeAccidentalHistoryCopies(items);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('preserves intentional copies with different descriptions', () => {
    const items = [
      {
        id: '1',
        urlId: 'chat-1',
        description: 'Release plan',
        timestamp: '2026-03-17T09:00:00.000Z',
        metadata: undefined,
        messages: [{ id: 'm1', role: 'assistant', content: 'Here is the plan', parts: [] }],
      },
      {
        id: '2',
        urlId: 'chat-2',
        description: 'Release plan (copy)',
        timestamp: '2026-03-17T09:05:00.000Z',
        metadata: undefined,
        messages: [{ id: 'x1', role: 'assistant', content: 'Here is the plan', parts: [] }],
      },
    ] as any;

    const result = dedupeAccidentalHistoryCopies(items);

    expect(result).toHaveLength(2);
  });

  it('collapses truncated duplicate copies and keeps the richer history', () => {
    const items = [
      {
        id: '1',
        urlId: 'chat-1',
        description: 'Checkout flow refactor',
        timestamp: '2026-03-17T09:00:00.000Z',
        metadata: undefined,
        messages: [
          { id: 'm1', role: 'user', content: 'Refactor checkout flow', parts: [] },
          { id: 'm2', role: 'assistant', content: 'Started refactor plan', parts: [] },
        ],
      },
      {
        id: '2',
        urlId: 'chat-2',
        description: 'Checkout flow refactor',
        timestamp: '2026-03-17T09:05:00.000Z',
        metadata: undefined,
        messages: [{ id: 'x1', role: 'assistant', content: 'Started refactor plan', parts: [] }],
      },
    ] as any;

    const result = dedupeAccidentalHistoryCopies(items);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
    expect(result[0].messages).toHaveLength(2);
  });

  it('keeps chats visible when description is missing by deriving a fallback label', () => {
    const items = [
      {
        id: '1',
        urlId: 'chat-1',
        description: '',
        timestamp: '2026-03-17T09:00:00.000Z',
        metadata: undefined,
        messages: [{ id: 'm1', role: 'user', content: 'Fix broken checkout sidebar listing', parts: [] }],
      },
    ] as any;

    const result = normalizeHistoryItemsForSidebar(items);

    expect(result).toHaveLength(1);
    expect(result[0].description).toContain('Fix broken checkout sidebar listing');
  });

  it('collapses repeated auto-generated discussion entries when one copy has sparse history', () => {
    const items = [
      {
        id: '1',
        urlId: 'chat-1',
        description: '[Model: gpt-5.3-c...] build app shell',
        timestamp: '2026-03-17T12:00:00.000Z',
        metadata: undefined,
        messages: [{ id: 'm1', role: 'user', content: 'Build a dashboard with auth', parts: [] }],
      },
      {
        id: '2',
        urlId: 'chat-2',
        description: '[Model: gpt-5.3-c...] build app shell',
        timestamp: '2026-03-17T12:05:00.000Z',
        metadata: undefined,
        messages: [],
      },
      {
        id: '3',
        urlId: 'chat-3',
        description: '[Model: gpt-5.3-c...] build app shell',
        timestamp: '2026-03-17T12:10:00.000Z',
        metadata: undefined,
        messages: [{ id: 'm3', role: 'user', content: 'Build a dashboard with auth', parts: [] }],
      },
    ] as any;

    const result = dedupeAccidentalHistoryCopies(items);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('collapses auto-generated discussion duplicates even when descriptions differ by suffix', () => {
    const items = [
      {
        id: '1',
        urlId: 'chat-1',
        description: '[Model: gpt-5.3-c...] build login page first pass',
        timestamp: '2026-03-17T12:00:00.000Z',
        metadata: undefined,
        messages: [{ id: 'm1', role: 'user', content: 'Build a login page with validation', parts: [] }],
      },
      {
        id: '2',
        urlId: 'chat-2',
        description: '[Model: gpt-5.3-c...] build login page retry',
        timestamp: '2026-03-17T12:05:00.000Z',
        metadata: undefined,
        messages: [{ id: 'm2', role: 'user', content: 'Build a login page with validation', parts: [] }],
      },
    ] as any;

    const result = dedupeAccidentalHistoryCopies(items);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('adds running number prefix when duplicate chat names exist', () => {
    const items = [
      {
        id: '1',
        urlId: 'chat-1',
        description: 'Release plan',
        timestamp: '2026-03-17T09:00:00.000Z',
        metadata: undefined,
        messages: [],
      },
      {
        id: '2',
        urlId: 'chat-2',
        description: 'Release plan',
        timestamp: '2026-03-17T09:05:00.000Z',
        metadata: undefined,
        messages: [],
      },
      {
        id: '3',
        urlId: 'chat-3',
        description: 'Status update',
        timestamp: '2026-03-17T09:06:00.000Z',
        metadata: undefined,
        messages: [],
      },
    ] as any;

    const result = ensureDistinctChatNames(items);

    expect(result.find((item) => item.id === '1')?.description).toBe('001- Release plan');
    expect(result.find((item) => item.id === '2')?.description).toBe('002- Release plan');
    expect(result.find((item) => item.id === '3')?.description).toBe('Status update');
  });
});
