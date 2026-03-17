import { describe, expect, it } from 'vitest';

import * as appAuthz from '../../../app/platform/security/authz';
import * as coreAuthz from '~/platform/security/authz';

describe('app/platform/security/authz.ts', () => {
  it('re-exports authz helpers from platform/security/authz', () => {
    expect(appAuthz.normalizePlatformRole).toBe(coreAuthz.normalizePlatformRole);
    expect(appAuthz.canAccessRole).toBe(coreAuthz.canAccessRole);
  });

  it('keeps core role behavior through app-layer re-export', () => {
    expect(appAuthz.normalizePlatformRole('user', true)).toBe('global_admin');
    expect(appAuthz.canAccessRole('developer_admin', 'user')).toBe(true);
    expect(appAuthz.canAccessRole('user', 'developer_admin')).toBe(false);
  });
});
