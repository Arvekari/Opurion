import { describe, expect, it } from 'vitest';

import { issueJwtToken, verifyJwtToken } from '~/platform/security/jwt';

describe('jwt', () => {
  it('issues and verifies signed token payload', async () => {
    const token = await issueJwtToken(
      { sub: 'u1', role: 'global_admin' },
      {
        jwtSecret: 'test-secret',
        ttlSeconds: 300,
      },
    );

    const payload = await verifyJwtToken(token, { jwtSecret: 'test-secret' });

    expect(payload?.sub).toBe('u1');
    expect(payload?.role).toBe('global_admin');
  });

  it('rejects token with wrong secret', async () => {
    const token = await issueJwtToken(
      { sub: 'u1', role: 'user' },
      {
        jwtSecret: 'secret-a',
        ttlSeconds: 300,
      },
    );

    const payload = await verifyJwtToken(token, { jwtSecret: 'secret-b' });

    expect(payload).toBeNull();
  });
});
