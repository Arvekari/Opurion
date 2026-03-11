import { describe, expect, it } from 'vitest';

import { hasRequiredRole } from '~/platform/security/require-role';

describe('require-role', () => {
  it('allows global admin for admin and user requirement', () => {
    expect(hasRequiredRole('global_admin', 'developer_admin')).toBe(true);
    expect(hasRequiredRole('global_admin', 'user')).toBe(true);
  });

  it('blocks user for admin requirement', () => {
    expect(hasRequiredRole('user', 'developer_admin')).toBe(false);
  });
});
