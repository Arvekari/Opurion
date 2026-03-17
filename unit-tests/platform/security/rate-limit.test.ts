import { describe, expect, it } from 'vitest';

import * as appRateLimit from '../../../app/platform/security/rate-limit';
import * as coreRateLimit from '~/platform/security/rate-limit';

describe('app/platform/security/rate-limit.ts', () => {
  it('re-exports rate limit helpers from platform/security/rate-limit', () => {
    expect(appRateLimit.checkRateLimit).toBe(coreRateLimit.checkRateLimit);
    expect(appRateLimit.getRateLimitPolicy).toBe(coreRateLimit.getRateLimitPolicy);
  });

  it('preserves core rate-limit behavior through app-layer export', () => {
    const key = `security-wrapper-${Date.now()}`;
    const first = appRateLimit.checkRateLimit({ key, limit: 1, windowMs: 1000, now: 1 });
    const second = appRateLimit.checkRateLimit({ key, limit: 1, windowMs: 1000, now: 2 });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
  });
});
