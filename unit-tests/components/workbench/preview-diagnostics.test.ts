import { describe, expect, it } from 'vitest';
import {
  createPreviewAlertFromHealth,
  createPreviewLoadFailedAlert,
  createPreviewRuntimeErrorAlert,
  createPreviewTimeoutAlert,
  detectBlankPreview,
  detectPreviewBuildError,
} from '../../../app/components/workbench/preview-diagnostics';

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

  it('detects Vite and parser failures in preview content', () => {
    const alert = detectPreviewBuildError({
      url: 'https://preview.local/app',
      readyState: 'complete',
      bodyText:
        "[plugin:vite:react-babel] /home/project/src/main.jsx: Unexpected token (1:0)\n/home/project/src/main.jsx:1:0\n1 | <![CDATA[import React from 'react';",
      childElementCount: 1,
    });

    expect(alert?.title).toBe('Preview build failed');
    expect(alert?.content).toContain('/home/project/src/main.jsx:1:0');
  });

  it('creates structured alerts from preview health and runtime messages', () => {
    const blankAlert = createPreviewAlertFromHealth({
      status: 'blank',
      reason: 'window-load',
      url: 'https://preview.local/app',
      readyState: 'complete',
      title: '',
      bodyText: '',
      childElementCount: 0,
    });

    const runtimeAlert = createPreviewRuntimeErrorAlert({
      url: 'https://preview.local/app',
      message: 'ReferenceError: foo is not defined',
      filename: '/src/App.tsx',
      line: 12,
      column: 4,
    });

    expect(blankAlert?.title).toBe('Preview appears blank');
    expect(runtimeAlert.content).toContain('/src/App.tsx:12:4');
  });

  it('builds timeout and load failure alerts', () => {
    expect(createPreviewTimeoutAlert('https://preview.local/app').title).toBe('Preview is unresponsive');
    expect(createPreviewLoadFailedAlert('https://preview.local/app').title).toBe('Preview failed to load');
  });
});
