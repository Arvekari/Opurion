import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { createUser, findUserByUsername, getUserCount } from '~/lib/.server/persistence';
import { createAuthCookies, generateSalt, getSecureCookieDirective, hashPassword } from '~/lib/.server/auth';
import { enforceRateLimit } from '~/platform/security/request-guard';
import { issueJwtToken } from '~/platform/security/jwt';

export async function action({ request, context }: ActionFunctionArgs) {
  const { requestId, blockedResponse } = enforceRateLimit(
    { request, context } as ActionFunctionArgs,
    'api.auth.signup',
  );

  if (blockedResponse) {
    return blockedResponse;
  }

  const env = context.cloudflare?.env as Record<string, any> | undefined;
  const body = await request.json<{ username: string; password: string }>();

  const username = body.username?.trim().toLowerCase();
  const password = body.password || '';

  if (!username || username.length < 3) {
    return json({ ok: false, error: 'Username must be at least 3 characters.', requestId }, { status: 400 });
  }

  if (password.length < 8) {
    return json({ ok: false, error: 'Password must be at least 8 characters.', requestId }, { status: 400 });
  }

  try {
    const existing = await findUserByUsername(username, env);

    if (existing) {
      return json({ ok: false, error: 'Username already exists.', requestId }, { status: 409 });
    }

    const count = await getUserCount(env);
    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);

    const created = await createUser(
      {
        username,
        passwordHash,
        passwordSalt: salt,
        isAdmin: count === 0,
      },
      env,
    );

    if (!created) {
      return json({ ok: false, error: 'Failed to create user.', requestId }, { status: 500 });
    }

    const cookies = await createAuthCookies(created.id, env);
    const headers = new Headers();
    cookies.forEach((cookie) => headers.append('Set-Cookie', cookie));

    const jwtSecret = (env?.BOLT_JWT_SECRET || 'bolt-default-jwt-secret') as string;
    const jwt = await issueJwtToken(
      { sub: created.id, role: created.isAdmin ? 'admin' : 'user' },
      { jwtSecret, ttlSeconds: 60 * 60 * 24 * 14 },
    );
    const secureCookieDirective = getSecureCookieDirective(env);
    headers.append(
      'Set-Cookie',
      `bolt_jwt=${encodeURIComponent(jwt)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600${secureCookieDirective}`,
    );

    headers.set('x-request-id', requestId);

    return json(
      { ok: true, requestId, user: { id: created.id, username: created.username, isAdmin: created.isAdmin } },
      { headers },
    );
  } catch {
    return json(
      { ok: false, error: 'Authentication service unavailable. Please check database setup.', requestId },
      { status: 500 },
    );
  }
}
