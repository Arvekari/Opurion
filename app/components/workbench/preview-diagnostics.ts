import type { ActionAlert } from '~/types/actions';

export interface PreviewDocumentSnapshot {
  readonly url: string;
  readonly readyState?: string;
  readonly bodyText?: string;
  readonly childElementCount?: number;
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
