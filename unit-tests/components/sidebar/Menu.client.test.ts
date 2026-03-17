import { describe, expect, it } from 'vitest';
import { dedupeAccidentalHistoryCopies } from '../../../app/components/sidebar/Menu.client';

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
});
