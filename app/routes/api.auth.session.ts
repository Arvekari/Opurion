import { type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { getCurrentUserFromRequest } from '~/lib/.server/auth';
import { getUserCount } from '~/lib/.server/persistence';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare?.env as Record<string, any> | undefined;

  try {
    const user = await getCurrentUserFromRequest(request, env);
    const userCount = await getUserCount(env);

    return json({
      authenticated: !!user,
      requireSignup: userCount === 0,
      user: user
        ? {
            id: user.userId,
            username: user.username,
            isAdmin: user.isAdmin,
          }
        : null,
    });
  } catch {
    return json({
      authenticated: false,
      requireSignup: true,
      user: null,
      degraded: true,
    });
  }
}
