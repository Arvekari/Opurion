import { describe, expect, it } from 'vitest';

import { canAccessRole } from '~/platform/security/authz';

describe('authz', () => {
  it('allows global admin to access admin and user routes', () => {
    expect(canAccessRole('global_admin', 'developer_admin')).toBe(true);
    expect(canAccessRole('global_admin', 'user')).toBe(true);
  });

  it('allows user role to access only user routes', () => {
    expect(canAccessRole('user', 'user')).toBe(true);
    expect(canAccessRole('user', 'developer_admin')).toBe(false);
  });

  it('denies unknown role', () => {
    expect(canAccessRole(undefined, 'user')).toBe(false);
  });
});
