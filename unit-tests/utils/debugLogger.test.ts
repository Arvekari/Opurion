/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { captureTerminalLog, getDebugLogger } from '~/utils/debugLogger';

describe('utils/debugLogger', () => {
  afterEach(() => {
    getDebugLogger().clearLogs();
  });

  it('returns captured terminal logs through the getter', () => {
    captureTerminalLog('pnpm dev', 'input', 'pnpm dev');
    captureTerminalLog('Vite ready', 'output', 'pnpm dev');

    const logs = getDebugLogger().getTerminalLogs();

    expect(logs.some((entry) => entry.content === 'pnpm dev' && entry.type === 'input')).toBe(true);
    expect(logs.some((entry) => entry.content === 'Vite ready' && entry.type === 'output')).toBe(true);
  });
});