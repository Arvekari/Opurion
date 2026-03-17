import type { ActionAlert } from '~/types/actions';

export interface PreviewDocumentSnapshot {
  readonly url: string;
  readonly readyState?: string;
  readonly title?: string;
  readonly bodyText?: string;
  readonly childElementCount?: number;
  readonly htmlSnippet?: string;
  readonly errorText?: string;
}

export interface PreviewHealthPayload {
  readonly status: 'ok' | 'blank' | 'error';
  readonly reason?: string;
  readonly url: string;
  readonly title?: string;
  readonly readyState?: string;
  readonly bodyText?: string;
  readonly childElementCount?: number;
  readonly htmlSnippet?: string;
  readonly errorText?: string;
}

export interface PreviewRuntimeErrorPayload {
  readonly url: string;
  readonly message: string;
  readonly stack?: string;
  readonly filename?: string;
  readonly line?: number;
  readonly column?: number;
}

function createPreviewAlert(title: string, description: string, content: string): ActionAlert {
  return {
    type: 'preview',
    title,
    description,
    content,
    source: 'preview',
  };
}

function extractPreviewLocation(text: string): { code?: string; filePath?: string; line?: number; column?: number } {
  const pluginMatch = text.match(/\[(plugin:[^\]]+)\]/i);
  const locationMatch = text.match(/((?:\/|[A-Za-z]:\\)[^\n\r|]+?):(\d+):(\d+)/);

  return {
    code: pluginMatch?.[1],
    filePath: locationMatch?.[1],
    line: locationMatch?.[2] ? Number(locationMatch[2]) : undefined,
    column: locationMatch?.[3] ? Number(locationMatch[3]) : undefined,
  };
}

function formatLocationSummary(text: string): string {
  const location = extractPreviewLocation(text);
  const lines = [];

  if (location.code) {
    lines.push(`Code: ${location.code}`);
  }

  if (location.filePath) {
    lines.push(
      `Location: ${location.filePath}${location.line ? `:${location.line}${location.column ? `:${location.column}` : ''}` : ''}`,
    );
  }

  return lines.join('\n');
}

function looksLikeBuildError(text: string): boolean {
  return /\[plugin:vite|vite:react-babel|failed to resolve import|unexpected token|pre-transform error|transform failed|parse5|internal server error|cannot find module/i.test(
    text,
  );
}

export function detectBlankPreview(snapshot: PreviewDocumentSnapshot): ActionAlert | undefined {
  const normalizedUrl = snapshot.url.trim();
  const normalizedText = (snapshot.bodyText ?? '').trim();
  const childElementCount = snapshot.childElementCount ?? 0;
  const readyState = snapshot.readyState ?? 'unknown';

  if (normalizedUrl === '' || normalizedUrl === 'about:blank') {
    return createPreviewAlert(
      'Preview appears blank',
      'The preview loaded an empty document instead of the app output.',
      `URL: ${normalizedUrl || 'about:blank'}\nReady state: ${readyState}`,
    );
  }

  if (readyState === 'complete' && normalizedText.length === 0 && childElementCount <= 1) {
    return createPreviewAlert(
      'Preview appears blank',
      'The preview finished loading but rendered no visible content.',
      `URL: ${normalizedUrl}\nReady state: ${readyState}\nChild elements: ${childElementCount}`,
    );
  }

  return undefined;
}

export function detectPreviewBuildError(snapshot: PreviewDocumentSnapshot): ActionAlert | undefined {
  const combined = [snapshot.title, snapshot.errorText, snapshot.bodyText, snapshot.htmlSnippet]
    .filter(Boolean)
    .join('\n')
    .trim();

  if (!combined || !looksLikeBuildError(combined)) {
    return undefined;
  }

  const locationSummary = formatLocationSummary(combined);

  return createPreviewAlert(
    'Preview build failed',
    'The preview loaded a Vite or parser error instead of the app.',
    [
      `URL: ${snapshot.url}`,
      snapshot.readyState ? `Ready state: ${snapshot.readyState}` : undefined,
      locationSummary || undefined,
      '',
      combined,
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

export function createPreviewBlankAlert(snapshot: PreviewDocumentSnapshot): ActionAlert {
  return createPreviewAlert(
    'Preview appears blank',
    'The preview kept loading a blank page after startup checks and reload recovery.',
    [
      `URL: ${snapshot.url}`,
      snapshot.readyState ? `Ready state: ${snapshot.readyState}` : undefined,
      typeof snapshot.childElementCount === 'number' ? `Child elements: ${snapshot.childElementCount}` : undefined,
      snapshot.title ? `Title: ${snapshot.title}` : undefined,
      snapshot.bodyText ? `Body text:\n${snapshot.bodyText}` : undefined,
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

export function createPreviewRuntimeErrorAlert(payload: PreviewRuntimeErrorPayload): ActionAlert {
  return createPreviewAlert(
    'Preview runtime error',
    'The preview threw a runtime error during startup or render.',
    [
      `URL: ${payload.url}`,
      payload.filename
        ? `Location: ${payload.filename}${payload.line ? `:${payload.line}${payload.column ? `:${payload.column}` : ''}` : ''}`
        : undefined,
      `Message: ${payload.message}`,
      payload.stack ? `Stack:\n${payload.stack}` : undefined,
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

export function createPreviewAlertFromHealth(payload: PreviewHealthPayload): ActionAlert | undefined {
  if (payload.status === 'error') {
    return (
      detectPreviewBuildError(payload) ||
      createPreviewLoadFailedAlert(payload.url)
    );
  }

  if (payload.status === 'blank') {
    return createPreviewBlankAlert(payload);
  }

  return undefined;
}

export function createPreviewTimeoutAlert(url: string): ActionAlert {
  return createPreviewAlert(
    'Preview is unresponsive',
    'The preview did not finish loading in time and may be stalled.',
    `URL: ${url}\nThe app may be stuck during startup, dependency install, or browser execution.`,
  );
}

export function createPreviewLoadFailedAlert(url: string): ActionAlert {
  return createPreviewAlert(
    'Preview failed to load',
    'The embedded preview could not be loaded successfully.',
    `URL: ${url}\nCheck the dev server, routing, and browser console/runtime errors.`,
  );
}
