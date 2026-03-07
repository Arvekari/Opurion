import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STREAM_STALL_TIMEOUT_MS,
  isStreamingStalled,
  resolveEffectiveStreamingState,
} from '~/components/chat/streamingGuard';

describe('streaming guard', () => {
  it('marks stream as stalled after timeout window', () => {
    const startedAt = 1_000;
    const now = startedAt + DEFAULT_STREAM_STALL_TIMEOUT_MS;

    expect(isStreamingStalled(startedAt, now, DEFAULT_STREAM_STALL_TIMEOUT_MS)).toBe(true);
  });

  it('does not mark stream as stalled before timeout window', () => {
    const startedAt = 1_000;
    const now = startedAt + DEFAULT_STREAM_STALL_TIMEOUT_MS - 1;

    expect(isStreamingStalled(startedAt, now, DEFAULT_STREAM_STALL_TIMEOUT_MS)).toBe(false);
  });

  it('returns not stalled when stream has not started', () => {
    expect(isStreamingStalled(null, Date.now(), DEFAULT_STREAM_STALL_TIMEOUT_MS)).toBe(false);
    expect(isStreamingStalled(0, Date.now(), DEFAULT_STREAM_STALL_TIMEOUT_MS)).toBe(false);
  });

  it('suppresses streaming UI when stalled even if loading flags are true', () => {
    expect(
      resolveEffectiveStreamingState({
        isLoading: true,
        fakeLoading: false,
        stalled: true,
      }),
    ).toBe(false);

    expect(
      resolveEffectiveStreamingState({
        isLoading: false,
        fakeLoading: true,
        stalled: true,
      }),
    ).toBe(false);
  });

  it('keeps streaming UI active when loading and not stalled', () => {
    expect(
      resolveEffectiveStreamingState({
        isLoading: true,
        fakeLoading: false,
        stalled: false,
      }),
    ).toBe(true);

    expect(
      resolveEffectiveStreamingState({
        isLoading: false,
        fakeLoading: true,
        stalled: false,
      }),
    ).toBe(true);
  });
});
