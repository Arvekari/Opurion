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
          timestamp: '2026-03-11T12:00:00.000Z',
          level: 'info',
          message: 'Action started',
          category: 'system',
          details: { actionType: 'file' },
        },
      }),
    },
  },
}));

import { DebugLogPanel } from '~/components/chat/DebugLogPanel';

describe('components/chat/DebugLogPanel.tsx', () => {
  it('renders recent execution logs', () => {
    render(<DebugLogPanel panelId="test-debug-panel" />);

    expect(screen.getByText('Action started')).toBeTruthy();
    expect(screen.getByText(/actionType/)).toBeTruthy();
  });
});