import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import {
  isPersistenceEnabled,
  readPersistedMemory,
  readPersistedMemoryForUser,
  upsertPersistedMemory,
  upsertPersistedMemoryForUser,
} from '~/lib/.server/persistence';
import { getCurrentUserFromRequest } from '~/lib/.server/auth';

export async function loader({ context, request }: { context: any; request: Request }) {
  const env = context?.cloudflare?.env as Record<string, any> | undefined;
  const enabled = isPersistenceEnabled(env);
  const user = await getCurrentUserFromRequest(request, env);

  if (!enabled) {
    return json({
      enabled: false,
      apiKeys: {},
      providerSettings: {},
      customPrompt: { enabled: false, instructions: '' },
      dbConfig: { provider: 'sqlite', postgresUrl: '' },
    });
  }

  const memory = user ? await readPersistedMemoryForUser(user.userId, env) : await readPersistedMemory(env);

  return json({
    enabled: true,
    scope: user ? 'user' : 'global',
    apiKeys: memory?.apiKeys ?? {},
    providerSettings: memory?.providerSettings ?? {},
    customPrompt: memory?.customPrompt ?? { enabled: false, instructions: '' },
    dbConfig: memory?.dbConfig ?? { provider: 'sqlite', postgresUrl: '' },
  });
}

export async function action({ context, request }: ActionFunctionArgs) {
  const env = context?.cloudflare?.env as Record<string, any> | undefined;
  const enabled = isPersistenceEnabled(env);
  const user = await getCurrentUserFromRequest(request, env);

  if (!enabled) {
    return json({ ok: true, enabled: false });
  }

  try {
    const body = await request.json<{
      apiKeys?: Record<string, string>;
      providerSettings?: Record<string, any>;
      customPrompt?: { enabled?: boolean; instructions?: string };
      dbConfig?: { provider?: 'sqlite' | 'postgres'; postgresUrl?: string };
    }>();

    if (user) {
      await upsertPersistedMemoryForUser(
        user.userId,
        {
          apiKeys: body.apiKeys,
          providerSettings: body.providerSettings,
          customPrompt: body.customPrompt,
          dbConfig: body.dbConfig,
        },
        env,
      );
    } else {
      await upsertPersistedMemory(
        {
          apiKeys: body.apiKeys,
          providerSettings: body.providerSettings,
          customPrompt: body.customPrompt,
          dbConfig: body.dbConfig,
        },
        env,
      );
    }

    return json({ ok: true, enabled: true, scope: user ? 'user' : 'global' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const writableHint =
      message.includes('EACCES') || message.includes('EPERM')
        ? ' SQLite persistence path is not writable. Ensure /data is mounted and writable.'
        : '';

    return json(
      {
        ok: false,
        error: `Failed to persist setup configuration.${writableHint}`,
      },
      { status: 500 },
    );
  }
}
