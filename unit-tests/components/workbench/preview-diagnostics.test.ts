import { describe, expect, it } from 'vitest';
import {
  createPreviewLoadFailedAlert,
  createPreviewTimeoutAlert,
  detectBlankPreview,
} from '~/components/workbench/preview-diagnostics';

describe('preview diagnostics', () => {
  it('detects explicit about:blank preview loads', () => {
    const alert = detectBlankPreview({
      url: 'about:blank',
      readyState: 'complete',
      bodyText: '',
      childElementCount: 0,
    });

    expect(alert?.title).toBe('Preview appears blank');
    expect(alert?.source).toBe('preview');
  });

  it('detects empty completed documents as blank previews', () => {
    const alert = detectBlankPreview({
      url: 'https://preview.local/app',
      readyState: 'complete',
      bodyText: '   ',
      childElementCount: 1,
    });

    expect(alert?.description).toContain('rendered no visible content');
  });

  it('does not flag non-empty previews as blank', () => {
    const alert = detectBlankPreview({
      url: 'https://preview.local/app',
      readyState: 'complete',
      bodyText: 'Hello world',
      childElementCount: 2,
    });

    expect(alert).toBeUndefined();
  });

  it('builds timeout and load failure alerts', () => {
    expect(createPreviewTimeoutAlert('https://preview.local/app').title).toBe('Preview is unresponsive');
    expect(createPreviewLoadFailedAlert('https://preview.local/app').title).toBe('Preview failed to load');
  });
});
