import { describe, expect, it } from 'vitest';

describe('components/workbench/terminal/TerminalDiagnosticsPanel.tsx baseline', () => {
  it('exports the diagnostics panel component at the mapped test path', async () => {
    const module = await import('~/components/workbench/terminal/TerminalDiagnosticsPanel');

    expect(module.TerminalDiagnosticsPanel).toBeTypeOf('object');
  });
});