import { describe, expect, it } from 'vitest';
import { buildRuntimeDiagnosticsPrefix, shouldAttachRuntimeDiagnostics } from '~/components/chat/runtime-diagnostics';

describe('runtime diagnostics helper', () => {
  it('attaches preview diagnostics for blank page reports', () => {
    const alert = {
      type: 'preview',
      title: 'Preview appears blank',
      description: 'The preview finished loading but rendered no visible content.',
      content: 'URL: https://preview.local/app',
      source: 'preview' as const,
    };

    expect(shouldAttachRuntimeDiagnostics('the preview is a blank page', alert)).toBe(true);

    const prefix = buildRuntimeDiagnosticsPrefix('the preview is a blank page', alert);
    expect(prefix).toContain('[Runtime Diagnostics]');
    expect(prefix).toContain('Preview appears blank');
  });

  it('attaches terminal diagnostics for command failure reports', () => {
    const alert = {
      type: 'error',
      title: 'Command Failed',
      description: 'pnpm dev failed',
      content: 'Output: missing package.json',
      source: 'terminal' as const,
    };

    expect(shouldAttachRuntimeDiagnostics('run commands fail all the time', alert)).toBe(true);
    expect(buildRuntimeDiagnosticsPrefix('run commands fail all the time', alert)).toContain('missing package.json');
  });

  it('does not attach diagnostics for unrelated messages', () => {
    const alert = {
      type: 'error',
      title: 'Command Failed',
      description: 'pnpm dev failed',
      content: 'Output: missing package.json',
      source: 'terminal' as const,
    };

    expect(shouldAttachRuntimeDiagnostics('please add a navbar', alert)).toBe(false);
    expect(buildRuntimeDiagnosticsPrefix('please add a navbar', alert)).toBe('');
  });
});
