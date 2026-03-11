import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { generateSalt, getCurrentUserFromRequest, hashPassword } from '~/lib/.server/auth';
import {
  createUser,
  deleteUserRecord,
  findUserByEmail,
  findUserByUsername,
  getUserCount,
  listUsers,
  updateUserPassword,
  updateUserRecord,
} from '~/lib/.server/persistence';
import { canAccessRole, normalizePlatformRole } from '~/platform/security/authz';

type SessionRole = 'global_admin' | 'developer_admin' | 'user';

type CreateUserAction = {
  action: 'create';
  username: string;
  email?: string;
  password: string;
  role: SessionRole;
};

type UpdateUserAction = {
  action: 'update';
  id: string;
  username?: string;
  email?: string;
  role?: SessionRole;
  password?: string;
};

type DeleteUserAction = {
  action: 'delete';
  id: string;
};

type UserActionPayload = CreateUserAction | UpdateUserAction | DeleteUserAction;

function isValidRole(value: string | undefined): value is SessionRole {
  return value === 'global_admin' || value === 'developer_admin' || value === 'user';
}

function normalizeEmail(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();

  return trimmed ? trimmed : undefined;
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare?.env as Record<string, any> | undefined;

  try {
    const sessionUser = await getCurrentUserFromRequest(request, env);

    if (!sessionUser) {
      return json({ ok: false, error: 'Authentication required.' }, { status: 401 });
    }

    const sessionRole = normalizePlatformRole(sessionUser.role, sessionUser.isAdmin);

    if (!canAccessRole(sessionRole, 'developer_admin')) {
      return json({ ok: false, error: 'Administrator access required.' }, { status: 403 });
    }

    const payload = (await request.json()) as UserActionPayload;

    if (payload.action === 'create') {
      const username = payload.username?.trim().toLowerCase();
      const email = normalizeEmail(payload.email);
      const password = payload.password || '';
      const role = payload.role;

      if (!username || username.length < 3) {
        return json({ ok: false, error: 'Username must be at least 3 characters.' }, { status: 400 });
      }

      if (password.length < 8) {
        return json({ ok: false, error: 'Password must be at least 8 characters.' }, { status: 400 });
      }

      if (!isValidRole(role)) {
        return json({ ok: false, error: 'Invalid role.' }, { status: 400 });
      }

      if (role === 'global_admin' && !canAccessRole(sessionRole, 'global_admin')) {
        return json({ ok: false, error: 'Only global admins can assign global admin role.' }, { status: 403 });
      }

      const existingByUsername = await findUserByUsername(username, env);

      if (existingByUsername) {
        return json({ ok: false, error: 'Username already exists.' }, { status: 409 });
      }

      if (email) {
        const existingByEmail = await findUserByEmail(email, env);

        if (existingByEmail) {
          return json({ ok: false, error: 'Email already exists.' }, { status: 409 });
        }
      }

      const passwordSalt = generateSalt();
      const passwordHash = await hashPassword(password, passwordSalt);
      const created = await createUser({ username, email, passwordHash, passwordSalt, role }, env);

      if (!created) {
        return json({ ok: false, error: 'Failed to create user.' }, { status: 500 });
      }

      return json({ ok: true, created });
    }

    if (payload.action === 'update') {
      const id = payload.id?.trim();

      if (!id) {
        return json({ ok: false, error: 'User id is required.' }, { status: 400 });
      }

      if (id === sessionUser.userId && payload.role && payload.role === 'user') {
        return json({ ok: false, error: 'You cannot remove your own admin access.' }, { status: 400 });
      }

      if (payload.role === 'global_admin' && !canAccessRole(sessionRole, 'global_admin')) {
        return json({ ok: false, error: 'Only global admins can assign global admin role.' }, { status: 403 });
      }

      const users = await listUsers(env);
      const target = users.find((user) => user.id === id);

      if (!target) {
        return json({ ok: false, error: 'User not found.' }, { status: 404 });
      }

      const nextUsername = payload.username?.trim().toLowerCase();
      const nextEmail = payload.email !== undefined ? normalizeEmail(payload.email) : undefined;

      if (nextUsername) {
        const conflict = users.find((user) => user.username === nextUsername && user.id !== id);

        if (conflict) {
          return json({ ok: false, error: 'Username already exists.' }, { status: 409 });
        }
      }

      if (nextEmail !== undefined && nextEmail) {
        const conflict = users.find((user) => (user.email || '').toLowerCase() === nextEmail && user.id !== id);

        if (conflict) {
          return json({ ok: false, error: 'Email already exists.' }, { status: 409 });
        }
      }

      if (payload.role && !isValidRole(payload.role)) {
        return json({ ok: false, error: 'Invalid role.' }, { status: 400 });
      }

      const updated = await updateUserRecord(
        {
          id,
          username: nextUsername,
          email: nextEmail,
          role: payload.role,
        },
        env,
      );

      if (!updated) {
        return json({ ok: false, error: 'Failed to update user.' }, { status: 500 });
      }

      if (payload.password !== undefined && payload.password !== '') {
        if (payload.password.length < 8) {
          return json({ ok: false, error: 'Password must be at least 8 characters.' }, { status: 400 });
        }

        const passwordSalt = generateSalt();
        const passwordHash = await hashPassword(payload.password, passwordSalt);
        const passwordUpdated = await updateUserPassword({ id, passwordHash, passwordSalt }, env);

        if (!passwordUpdated) {
          return json({ ok: false, error: 'User updated, but password update failed.' }, { status: 500 });
        }
      }

      return json({ ok: true });
    }

    if (payload.action === 'delete') {
      const id = payload.id?.trim();

      if (!id) {
        return json({ ok: false, error: 'User id is required.' }, { status: 400 });
      }

      if (id === sessionUser.userId) {
        return json({ ok: false, error: 'You cannot delete your own account.' }, { status: 400 });
      }

      const deleted = await deleteUserRecord(id, env);

      if (!deleted) {
        return json({ ok: false, error: 'Failed to delete user.' }, { status: 500 });
      }

      return json({ ok: true });
    }

    return json({ ok: false, error: 'Unsupported action.' }, { status: 400 });
  } catch {
    return json({ ok: false, error: 'User management service unavailable.' }, { status: 500 });
  }
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare?.env as Record<string, any> | undefined;
  const url = new URL(request.url);
  const includeUsers = url.searchParams.get('includeUsers') === '1';

  try {
    const user = await getCurrentUserFromRequest(request, env);
    const userCount = await getUserCount(env);
    const normalizedRole = user ? normalizePlatformRole(user.role, user.isAdmin) : undefined;

    let users:
      | Array<{ id: string; username: string; email?: string; isAdmin: boolean; role: string; createdAt: string }>
      | undefined;

    if (includeUsers && user && normalizedRole && canAccessRole(normalizedRole, 'developer_admin')) {
      users = await listUsers(env);
    }

    return json({
      authenticated: !!user,
      requireSignup: userCount === 0,
      user: user
        ? {
            id: user.userId,
            username: user.username,
            isAdmin: user.isAdmin,
            role: normalizedRole,
          }
        : null,
      users,
    });
  } catch {
    return json({
      authenticated: false,
      requireSignup: true,
      user: null,
      users: undefined,
      degraded: true,
    });
  }
}
