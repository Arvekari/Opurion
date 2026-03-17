import { describe, expect, it } from 'vitest';
import {
  buildDebugConsoleRows,
  buildOutputRows,
  buildProblemRows,
} from '~/components/workbench/terminal/terminal-diagnostics';

describe('workbench terminal diagnostics helpers', () => {
  const logs = [
    {
      id: '1',
      timestamp: '2026-03-14T10:00:00.000Z',
      level: 'error',
      message: 'Failed to load url /src/main.tsx',
      category: 'error',
      details: { plugin: 'vite' },
    },
    {
      id: '2',
      timestamp: '2026-03-14T10:01:00.000Z',
      level: 'info',
      message: 'Chat request started',
      category: 'system',
      details: { provider: 'OpenAI' },
    },
    {
      id: '3',
      timestamp: '2026-03-14T10:02:00.000Z',
      level: 'debug',
      message: 'stream chunk received',
      category: 'system',
      details: { size: 42 },
    },
  ] as any;

  it('builds problem rows from alerts and warning/error logs', () => {
    const rows = buildProblemRows({
      logs,
      actionAlert: {
        type: 'error',
        title: 'Preview failed to load',
        description: 'The embedded preview could not be loaded successfully.',
        content: 'parse5 cdata-in-html-content',
        source: 'preview',
      },
    });

    expect(rows[0].message).toContain('Preview failed to load');
    expect(rows.some((row) => row.message.includes('Failed to load url /src/main.tsx'))).toBe(true);
  });

  it('builds output rows without debug-only entries', () => {
    const rows = buildOutputRows(logs);

    expect(rows.some((row) => row.message === 'Chat request started')).toBe(true);
    expect(rows.some((row) => row.message === 'stream chunk received')).toBe(false);
  });

  it('builds debug console rows from terminal and debug logs', () => {
    const rows = buildDebugConsoleRows(logs, [
      {
        timestamp: '2026-03-14T10:03:00.000Z',
        type: 'output',
        content: 'vite v5.4.11 ready in 123 ms',
        command: 'pnpm dev',
      },
    ]);

    expect(rows[0].message).toContain('vite v5.4.11 ready');
    expect(rows.some((row) => row.message === 'stream chunk received')).toBe(true);
  });
});