/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@nanostores/react', () => ({
  useStore: (store: any) => (store && typeof store.get === 'function' ? store.get() : store),
}));

vi.mock('~/lib/stores/logs', () => ({
  logStore: {
    logs: {
      get: () => ({
        '1': {
          id: '1',
          timestamp: '2026-03-14T12:00:00.000Z',
          level: 'error',
          message: 'Failed to load url /src/main.tsx',
          category: 'error',
          details: { plugin: 'vite' },
        },
      }),
    },
  },
}));

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    alert: { get: () => undefined },
    SupabaseAlert: { get: () => undefined },
    DeployAlert: { get: () => undefined },
  },
}));

vi.mock('~/utils/debugLogger', () => ({
  getDebugLogger: () => ({
    getTerminalLogs: () => [],
  }),
}));

import { TerminalDiagnosticsPanel } from '~/components/workbench/terminal/TerminalDiagnosticsPanel';

describe('components/workbench/terminal/TerminalDiagnosticsPanel.tsx', () => {
  it('renders problem rows from log store data', () => {
    render(<TerminalDiagnosticsPanel view="problems" />);

    expect(screen.getByText(/Failed to load url \/src\/main.tsx/)).toBeTruthy();
    expect(screen.getAllByText(/error/i).length).toBeGreaterThan(0);
  });
});