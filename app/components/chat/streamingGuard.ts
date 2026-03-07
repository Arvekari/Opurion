export const DEFAULT_STREAM_STALL_TIMEOUT_MS = 120000;

export function isStreamingStalled(
  startedAtMs: number | null,
  nowMs: number,
  timeoutMs = DEFAULT_STREAM_STALL_TIMEOUT_MS,
) {
  if (!startedAtMs || startedAtMs <= 0) {
    return false;
  }

  return nowMs - startedAtMs >= timeoutMs;
}

export function resolveEffectiveStreamingState(params: { isLoading: boolean; fakeLoading: boolean; stalled: boolean }) {
  const isStreaming = params.isLoading || params.fakeLoading;
  return isStreaming && !params.stalled;
}
