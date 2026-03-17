import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STREAM_STALL_TIMEOUT_MS,
  isStreamingStalled,
  resolveEffectiveStreamingState,
} from '~/components/chat/streamingGuard';

describe('streaming guard', () => {
  it('marks stream as stalled after timeout window since last chunk', () => {
    const startedAt = 1_000;
    const lastChunkAt = startedAt + 5_000; // Last chunk at 5 seconds
    const now = lastChunkAt + DEFAULT_STREAM_STALL_TIMEOUT_MS; // No new chunks for 45+ seconds

    expect(isStreamingStalled(startedAt, lastChunkAt, now, DEFAULT_STREAM_STALL_TIMEOUT_MS)).toBe(true);
  });

  it('does not mark stream as stalled before timeout window since last chunk', () => {
    const startedAt = 1_000;
    const lastChunkAt = startedAt + 5_000;
    const now = lastChunkAt + DEFAULT_STREAM_STALL_TIMEOUT_MS - 1; // Just before timeout

    expect(isStreamingStalled(startedAt, lastChunkAt, now, DEFAULT_STREAM_STALL_TIMEOUT_MS)).toBe(false);
  });

  it('allows long responses if chunks keep arriving', () => {
    const startedAt = 1_000;
    const longResponseTime = startedAt + 200_000; // 200 seconds since stream started
    const lastChunkAt = longResponseTime - 1_000; // But chunk arrived just 1 second ago

    expect(isStreamingStalled(startedAt, lastChunkAt, longResponseTime, DEFAULT_STREAM_STALL_TIMEOUT_MS)).toBe(
      false,
    );
  });

  it('returns not stalled when stream has not started', () => {
    expect(isStreamingStalled(null, null, Date.now(), DEFAULT_STREAM_STALL_TIMEOUT_MS)).toBe(false);
    expect(isStreamingStalled(0, null, Date.now(), DEFAULT_STREAM_STALL_TIMEOUT_MS)).toBe(false);
  });

  it('returns not stalled before the first streamed chunk arrives', () => {
    const startedAt = 1_000;
    const now = startedAt + DEFAULT_STREAM_STALL_TIMEOUT_MS + 5_000;

    expect(isStreamingStalled(startedAt, null, now, DEFAULT_STREAM_STALL_TIMEOUT_MS)).toBe(false);
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
