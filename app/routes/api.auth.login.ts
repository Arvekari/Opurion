import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { createAuthCookies, hashPassword } from '~/lib/.server/auth';
import { findUserByUsername } from '~/lib/.server/persistence';
import { enforceRateLimit } from '~/platform/security/request-guard';
import { issueJwtToken } from '~/platform/security/jwt';
import { normalizePlatformRole } from '~/platform/security/authz';

export async function action({ request, context }: ActionFunctionArgs) {
  const { requestId, blockedResponse } = enforceRateLimit({ request, context } as ActionFunctionArgs, 'api.auth.login');

  if (blockedResponse) {
    return blockedResponse;
  }

  const env = context.cloudflare?.env as Record<string, any> | undefined;
  const body = await request.json<{ username: string; password: string }>();

  const username = body.username?.trim().toLowerCase();
  const password = body.password || '';

  if (!username || !password) {
    return json({ ok: false, error: 'Username and password are required.', requestId }, { status: 400 });
  }

  try {
    const user = await findUserByUsername(username, env);

    if (!user) {
      return json({ ok: false, error: 'Invalid credentials.', requestId }, { status: 401 });
    }

    const expectedHash = await hashPassword(password, user.passwordSalt);

    if (expectedHash !== user.passwordHash) {
      return json({ ok: false, error: 'Invalid credentials.', requestId }, { status: 401 });
    }

    const cookies = await createAuthCookies(user.id, env);
    const headers = new Headers();
    cookies.forEach((cookie) => headers.append('Set-Cookie', cookie));
    const normalizedRole = normalizePlatformRole(user.role, user.isAdmin);

    const jwtSecret = (env?.BOLT_JWT_SECRET || 'bolt-default-jwt-secret') as string;
    const jwt = await issueJwtToken(
      { sub: user.id, role: normalizedRole },
      { jwtSecret, ttlSeconds: 60 * 60 * 24 * 2 },
    );
    const secureCookieDirective =
      String(env?.BOLT_COOKIE_SECURE || '').toLowerCase() === 'true' ||
      String(env?.RUNNING_IN_DOCKER || '').toLowerCase() === 'true' ||
      String(env?.NODE_ENV || '').toLowerCase() === 'production'
        ? '; Secure'
        : '';

    headers.append(
      'Set-Cookie',
      `bolt_jwt=${encodeURIComponent(jwt)}; Path=/; HttpOnly; SameSite=Lax${secureCookieDirective}`,
    );

    headers.set('x-request-id', requestId);

    return json(
      {
        ok: true,
        requestId,
        user: {
          id: user.id,
          username: user.username,
          isAdmin: user.isAdmin,
          role: normalizedRole,
        },
      },
      { headers },
    );
  } catch {
    return json(
      { ok: false, error: 'Authentication service unavailable. Please check database setup.', requestId },
      { status: 500 },
    );
  }
}
