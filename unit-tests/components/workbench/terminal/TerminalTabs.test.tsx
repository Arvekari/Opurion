/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@nanostores/react', () => ({
  useStore: (store: any) => (store && typeof store.get === 'function' ? store.get() : store),
}));

vi.mock('react-resizable-panels', () => ({
  Panel: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    showTerminal: { get: () => true },
    toggleTerminal: vi.fn(),
    attachBoltTerminal: vi.fn(),
    attachTerminal: vi.fn(),
    detachTerminal: vi.fn(),
    onTerminalResize: vi.fn(),
  },
}));

vi.mock('~/lib/stores/theme', () => ({
  themeStore: {
    get: () => 'dark',
    subscribe: () => () => undefined,
  },
}));

vi.mock('~/lib/hooks', () => ({
  shortcutEventEmitter: {
    on: () => () => undefined,
  },
}));

vi.mock('~/components/workbench/terminal/Terminal', () => ({
  Terminal: ({ className }: any) => <div className={className}>Terminal</div>,
}));

vi.mock('~/components/workbench/terminal/TerminalManager', () => ({
  TerminalManager: () => null,
}));

vi.mock('~/components/workbench/terminal/TerminalDiagnosticsPanel', () => ({
  TerminalDiagnosticsPanel: ({ view }: any) => <div>{view}</div>,
}));

vi.mock('~/components/ui/IconButton', () => ({
  IconButton: ({ title, icon, onClick }: any) => (
    <button onClick={onClick} title={title ?? icon}>
      {title ?? icon}
    </button>
  ),
}));

import { TerminalTabs } from '~/components/workbench/terminal/TerminalTabs';

describe('components/workbench/terminal/TerminalTabs.tsx', () => {
  it('renders IDE-style diagnostics tabs next to terminal tabs', () => {
    render(<TerminalTabs />);

    expect(screen.getByText('Opurion Terminal')).toBeTruthy();
    expect(screen.getByText('Problems')).toBeTruthy();
    expect(screen.getByText('Output')).toBeTruthy();
    expect(screen.getByText('Debug Console')).toBeTruthy();
  });
});