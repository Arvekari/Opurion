export const DEFAULT_STREAM_STALL_TIMEOUT_MS = 45000; // 45 seconds of no data (not total elapsed)
export const LOCAL_PROVIDER_STREAM_STALL_TIMEOUT_MS = 120000; // 120 seconds for local/self-hosted models

const LOCAL_PROVIDER_NAMES = new Set(['Ollama', 'LMStudio', 'OpenAILike']);

export function getStreamingStallTimeoutMs(providerName?: string | null) {
  if (providerName && LOCAL_PROVIDER_NAMES.has(providerName)) {
    return LOCAL_PROVIDER_STREAM_STALL_TIMEOUT_MS;
  }

  return DEFAULT_STREAM_STALL_TIMEOUT_MS;
}

export function isStreamingStalled(
  startedAtMs: number | null,
  lastChunkAtMs: number | null,
  nowMs: number,
  timeoutMs = DEFAULT_STREAM_STALL_TIMEOUT_MS,
) {
  // If stream never started or never received any streamed data, defer to transport-level timeouts.
  if (!startedAtMs || startedAtMs <= 0) {
    return false;
  }

  if (!lastChunkAtMs || lastChunkAtMs <= 0) {
    return false;
  }

  const relevantTimeMs = lastChunkAtMs > startedAtMs ? lastChunkAtMs : startedAtMs;

  return nowMs - relevantTimeMs >= timeoutMs;
}

export function resolveEffectiveStreamingState(params: { isLoading: boolean; fakeLoading: boolean; stalled: boolean }) {
  const isStreaming = params.isLoading || params.fakeLoading;
  return isStreaming && !params.stalled;
}
