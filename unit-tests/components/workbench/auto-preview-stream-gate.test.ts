import { describe, expect, it } from 'vitest';
import {
  AUTO_PREVIEW_STREAM_SETTLE_MS,
  getAutoPreviewLaunchDelayMs,
} from '../../../app/components/workbench/auto-preview-stream-gate';

describe('auto-preview stream gating', () => {
  it('returns full settle delay while streaming is active', () => {
    const delay = getAutoPreviewLaunchDelayMs({
      isStreaming: true,
      streaming: false,
      lastStreamingActivityAt: 0,
      now: 10_000,
    });

    expect(delay).toBe(AUTO_PREVIEW_STREAM_SETTLE_MS);
  });

  it('returns remaining settle delay after streaming just ended', () => {
    const delay = getAutoPreviewLaunchDelayMs({
      isStreaming: false,
      streaming: false,
      lastStreamingActivityAt: 10_000,
      now: 11_500,
      settleMs: 3_000,
    });

    expect(delay).toBe(1_500);
  });

  it('returns zero delay after settle window is complete', () => {
    const delay = getAutoPreviewLaunchDelayMs({
      isStreaming: false,
      streaming: false,
      lastStreamingActivityAt: 10_000,
      now: 13_100,
      settleMs: 3_000,
    });

    expect(delay).toBe(0);
  });

  it('returns zero delay when no recent streaming activity is tracked', () => {
    const delay = getAutoPreviewLaunchDelayMs({
      isStreaming: false,
      streaming: false,
      lastStreamingActivityAt: 0,
      now: 13_100,
    });

    expect(delay).toBe(0);
  });
});
