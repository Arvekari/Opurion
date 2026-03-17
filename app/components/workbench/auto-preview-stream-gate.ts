export const AUTO_PREVIEW_STREAM_SETTLE_MS = 3200;

interface AutoPreviewLaunchDelayOptions {
  isStreaming: boolean;
  streaming: boolean;
  lastStreamingActivityAt: number;
  now?: number;
  settleMs?: number;
}

export function getAutoPreviewLaunchDelayMs({
  isStreaming,
  streaming,
  lastStreamingActivityAt,
  now = Date.now(),
  settleMs = AUTO_PREVIEW_STREAM_SETTLE_MS,
}: AutoPreviewLaunchDelayOptions): number {
  if (isStreaming || streaming) {
    return settleMs;
  }

  if (lastStreamingActivityAt <= 0) {
    return 0;
  }

  const elapsed = now - lastStreamingActivityAt;

  if (elapsed >= settleMs) {
    return 0;
  }

  return settleMs - elapsed;
}
