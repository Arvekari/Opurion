import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSessionUserMock, parseCookiesMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  parseCookiesMock: vi.fn(() => ({})),
}));

vi.mock('~/lib/.server/persistence', () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSessionUser: getSessionUserMock,
}));

vi.mock('~/lib/api/cookies', () => ({
  parseCookies: parseCookiesMock,
}));

import { getCurrentUserFromRequest } from '~/lib/.server/auth';

describe('app/lib/.server/auth.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no session token cookie exists', async () => {
    parseCookiesMock.mockReturnValue({});

    const result = await getCurrentUserFromRequest(new Request('http://localhost/api/auth/session'));

    expect(result).toBeNull();
    expect(getSessionUserMock).not.toHaveBeenCalled();
  });

  it('returns null when bolt_uid does not match resolved session user', async () => {
    parseCookiesMock.mockReturnValue({
      bolt_session: 'session-token',
      bolt_uid: 'u2',
    });
    getSessionUserMock.mockResolvedValue({ userId: 'u1', username: 'alice', isAdmin: false });

    const result = await getCurrentUserFromRequest(
      new Request('http://localhost/api/auth/session', {
        headers: { Cookie: 'bolt_session=session-token; bolt_uid=u2' },
      }),
    );

    expect(result).toBeNull();
  });

  it('returns the resolved session user when bolt_uid matches', async () => {
    parseCookiesMock.mockReturnValue({
      bolt_session: 'session-token',
      bolt_uid: 'u1',
    });
    getSessionUserMock.mockResolvedValue({ userId: 'u1', username: 'alice', isAdmin: true });

    const result = await getCurrentUserFromRequest(
      new Request('http://localhost/api/auth/session', {
        headers: { Cookie: 'bolt_session=session-token; bolt_uid=u1' },
      }),
    );

    expect(result).toEqual({ userId: 'u1', username: 'alice', isAdmin: true });
  });
});
