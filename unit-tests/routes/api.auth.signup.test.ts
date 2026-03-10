import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/lib/.server/persistence', () => ({
  createUser: vi.fn(),
  findUserByUsername: vi.fn(),
  getUserCount: vi.fn(),
}));

vi.mock('~/lib/.server/auth', () => ({
  createAuthCookies: vi.fn(),
  generateSalt: vi.fn(),
  getSecureCookieDirective: vi.fn(() => ''),
  hashPassword: vi.fn(),
}));

import { action } from '~/routes/api.auth.signup';
import { createUser, findUserByUsername, getUserCount } from '~/lib/.server/persistence';
import { createAuthCookies, generateSalt, hashPassword } from '~/lib/.server/auth';

describe('/api/auth/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for short username', async () => {
    const response = await action({
      request: new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ab', password: 'password123' }),
      }),
      context: { cloudflare: { env: {} } },
    } as any);

    expect(response.status).toBe(400);
  });

  it('returns 409 when username exists', async () => {
    vi.mocked(findUserByUsername).mockResolvedValue({ id: 'u1' } as any);

    const response = await action({
      request: new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'alice', password: 'password123' }),
      }),
      context: { cloudflare: { env: {} } },
    } as any);

    expect(response.status).toBe(409);
  });

  it('creates first user as admin and sets auth cookie', async () => {
    vi.mocked(findUserByUsername).mockResolvedValue(null);
    vi.mocked(getUserCount).mockResolvedValue(0);
    vi.mocked(generateSalt).mockReturnValue('salt');
    vi.mocked(hashPassword).mockResolvedValue('hashed');
    vi.mocked(createUser).mockResolvedValue({ id: 'u1', username: 'alice', isAdmin: true } as any);
    vi.mocked(createAuthCookies).mockResolvedValue(['bolt_session=a; Path=/']);

    const response = await action({
      request: new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'Alice', password: 'password123' }),
      }),
      context: { cloudflare: { env: {} } },
    } as any);

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.user.isAdmin).toBe(true);
  });

  it('returns JSON 500 when persistence lookup throws', async () => {
    vi.mocked(findUserByUsername).mockRejectedValue(new Error('postgrest unreachable'));

    const response = await action({
      request: new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'alice', password: 'password123' }),
      }),
      context: { cloudflare: { env: {} } },
    } as any);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(typeof data.error).toBe('string');
  });
});
