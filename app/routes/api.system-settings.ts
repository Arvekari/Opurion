import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { getCurrentUserFromRequest } from '~/lib/.server/auth';
import { isPersistenceEnabled, readPersistedMemory, upsertPersistedMemory } from '~/lib/.server/persistence';

type ApachePhpSettings = {
  enabled: boolean;
  ftpHost: string;
  ftpPort: number;
  ftpUsername: string;
  ftpPassword: string;
  serverRootPath: string;
  publicBaseUrl: string;
};

type N8nSettings = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
};

type OpenClawSettings = {
  enabled: boolean;
  baseUrl: string;
  timeoutMs: number;
  allowedTools: string;
};

type SystemSettings = {
  apachePhp: ApachePhpSettings;
  n8n: N8nSettings;
  openclaw: OpenClawSettings;
};

const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  apachePhp: {
    enabled: false,
    ftpHost: '',
    ftpPort: 21,
    ftpUsername: '',
    ftpPassword: '',
    serverRootPath: '/var/www/html',
    publicBaseUrl: '',
  },
  n8n: {
    enabled: false,
    baseUrl: '',
    apiKey: '',
  },
  openclaw: {
    enabled: false,
    baseUrl: '',
    timeoutMs: 30000,
    allowedTools: '',
  },
};

function toBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  return defaultValue;
}

function toString(value: unknown, defaultValue: string): string {
  return typeof value === 'string' ? value : defaultValue;
}

function toPort(value: unknown, defaultValue: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = Math.floor(value);
    return parsed > 0 && parsed <= 65535 ? parsed : defaultValue;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : defaultValue;
  }

  return defaultValue;
}

function normalizeSystemSettings(input: unknown): SystemSettings {
  const source = input && typeof input === 'object' ? (input as Record<string, any>) : {};
  const apache = source.apachePhp && typeof source.apachePhp === 'object' ? source.apachePhp : {};
  const n8n = source.n8n && typeof source.n8n === 'object' ? source.n8n : {};
  const openclaw = source.openclaw && typeof source.openclaw === 'object' ? source.openclaw : {};

  return {
    apachePhp: {
      enabled: toBoolean(apache.enabled, DEFAULT_SYSTEM_SETTINGS.apachePhp.enabled),
      ftpHost: toString(apache.ftpHost, DEFAULT_SYSTEM_SETTINGS.apachePhp.ftpHost),
      ftpPort: toPort(apache.ftpPort, DEFAULT_SYSTEM_SETTINGS.apachePhp.ftpPort),
      ftpUsername: toString(apache.ftpUsername, DEFAULT_SYSTEM_SETTINGS.apachePhp.ftpUsername),
      ftpPassword: toString(apache.ftpPassword, DEFAULT_SYSTEM_SETTINGS.apachePhp.ftpPassword),
      serverRootPath: toString(apache.serverRootPath, DEFAULT_SYSTEM_SETTINGS.apachePhp.serverRootPath),
      publicBaseUrl: toString(apache.publicBaseUrl, DEFAULT_SYSTEM_SETTINGS.apachePhp.publicBaseUrl),
    },
    n8n: {
      enabled: toBoolean(n8n.enabled, DEFAULT_SYSTEM_SETTINGS.n8n.enabled),
      baseUrl: toString(n8n.baseUrl, DEFAULT_SYSTEM_SETTINGS.n8n.baseUrl),
      apiKey: toString(n8n.apiKey, DEFAULT_SYSTEM_SETTINGS.n8n.apiKey),
    },
    openclaw: {
      enabled: toBoolean(openclaw.enabled, DEFAULT_SYSTEM_SETTINGS.openclaw.enabled),
      baseUrl: toString(openclaw.baseUrl, DEFAULT_SYSTEM_SETTINGS.openclaw.baseUrl),
      timeoutMs: toPort(openclaw.timeoutMs, DEFAULT_SYSTEM_SETTINGS.openclaw.timeoutMs),
      allowedTools: toString(openclaw.allowedTools, DEFAULT_SYSTEM_SETTINGS.openclaw.allowedTools),
    },
  };
}

async function requireAdmin(request: Request, env?: Record<string, any>) {
  const user = await getCurrentUserFromRequest(request, env);

  if (!user) {
    return { ok: false as const, response: json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };
  }

  if (!user.isAdmin) {
    return { ok: false as const, response: json({ ok: false, error: 'Admin access required' }, { status: 403 }) };
  }

  return { ok: true as const, user };
}

async function readSystemSettings(env?: Record<string, any>): Promise<SystemSettings> {
  const memory = await readPersistedMemory(env);
  const rawSystemSettings = memory?.providerSettings?.__systemSettings;
  return normalizeSystemSettings(rawSystemSettings);
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare?.env as Record<string, any> | undefined;

  if (!isPersistenceEnabled(env)) {
    return json({ ok: false, error: 'Persistence is disabled' }, { status: 400 });
  }

  const auth = await requireAdmin(request, env);

  if (!auth.ok) {
    return auth.response;
  }

  const settings = await readSystemSettings(env);
  return json({ ok: true, settings });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare?.env as Record<string, any> | undefined;

  if (!isPersistenceEnabled(env)) {
    return json({ ok: false, error: 'Persistence is disabled' }, { status: 400 });
  }

  const auth = await requireAdmin(request, env);

  if (!auth.ok) {
    return auth.response;
  }

  const body = await request.json<{ settings?: unknown }>();
  const next = normalizeSystemSettings(body.settings);

  await upsertPersistedMemory(
    {
      providerSettings: {
        __systemSettings: next,
      },
    },
    env,
  );

  return json({ ok: true, settings: next });
}
