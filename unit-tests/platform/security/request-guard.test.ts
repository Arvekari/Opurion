import { describe, expect, it } from 'vitest';

import { enforceRateLimit as appEnforceRateLimit } from '../../../app/platform/security/request-guard';
import { enforceRateLimit as coreEnforceRateLimit } from '~/platform/security/request-guard';

describe('app/platform/security/request-guard.ts', () => {
  it('re-exports enforceRateLimit from platform/security/request-guard', () => {
    expect(appEnforceRateLimit).toBe(coreEnforceRateLimit);
  });
});
