import { describe, expect, it } from 'vitest';

import { hasRequiredRole as appHasRequiredRole } from '../../../app/platform/security/require-role';
import { hasRequiredRole as coreHasRequiredRole } from '~/platform/security/require-role';

describe('app/platform/security/require-role.ts', () => {
  it('re-exports role guard helper from platform/security/require-role', () => {
    expect(appHasRequiredRole).toBe(coreHasRequiredRole);
  });

  it('preserves role check behavior through app-layer export', () => {
    expect(appHasRequiredRole('global_admin', 'developer_admin')).toBe(true);
    expect(appHasRequiredRole('user', 'developer_admin')).toBe(false);
  });
});
