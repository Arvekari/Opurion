type EnvLike = Record<string, string | undefined> | undefined;
import { logAuditEvent } from '~/platform/logging/audit-log';

export type OpenClawExecuteInput = {
  system: string;
  message: string;
  model: string;
  provider: string;
  env?: EnvLike;
  signal?: AbortSignal;
};

export type OpenClawExecuteResult = {
  output: string;
  remoteRunId?: string;
  raw: Record<string, unknown>;
};

export type OpenClawStatusResult = {
  remoteRunId: string;
  state: string;
  raw: Record<string, unknown>;
};

function getEnvValue(env: EnvLike, key: string): string | undefined {
  const processEnv = (globalThis as any)?.process?.env;
  const value = env?.[key] ?? processEnv?.[key];

  return typeof value === 'string' ? value : undefined;
}

function getBaseUrl(env?: EnvLike): string {
  const baseUrl = getEnvValue(env, 'OPENCLAW_BASE_URL');

  if (!baseUrl) {
    throw new Error('OPENCLAW_BASE_URL is not configured');
  }

  return baseUrl.replace(/\/$/, '');
}

function getTimeoutMs(env?: EnvLike): number {
  const raw = getEnvValue(env, 'OPENCLAW_TIMEOUT_MS') || '30000';
  const timeout = Number(raw);

  return Number.isFinite(timeout) && timeout > 0 ? Math.floor(timeout) : 30000;
}

function withTimeoutController(env?: EnvLike, externalSignal?: AbortSignal) {
  const timeoutMs = getTimeoutMs(env);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  return {
    signal: controller.signal,
    timeoutId,
  };
}

export function assertOpenClawToolAllowed(input: { toolName: string; env?: EnvLike }) {
  const allowListRaw = getEnvValue(input.env, 'OPENCLAW_ALLOWED_TOOLS');

  if (!allowListRaw || allowListRaw.trim() === '') {
    return;
  }

  const allowed = allowListRaw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!allowed.includes(input.toolName)) {
    logAuditEvent({
      action: 'openclaw.tool.blocked',
      provider: 'openclaw',
      status: 'blocked',
      metadata: {
        toolName: input.toolName,
        allowed,
      },
    });

    throw new Error(`OpenClaw tool is not allowed: ${input.toolName}`);
  }
}

export function isOpenClawConfigured(env?: EnvLike): boolean {
  return Boolean(getEnvValue(env, 'OPENCLAW_BASE_URL'));
}

export async function executeOpenClawAgent(input: OpenClawExecuteInput): Promise<OpenClawExecuteResult> {
  const baseUrl = getBaseUrl(input.env);
  const { signal, timeoutId } = withTimeoutController(input.env, input.signal);

  const response = await fetch(`${baseUrl}/v1/agent/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      system: input.system,
      message: input.message,
      model: input.model,
      provider: input.provider,
    }),
    signal,
  }).finally(() => {
    clearTimeout(timeoutId);
  });

  if (!response.ok) {
    throw new Error(`OpenClaw request failed with ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const output =
    (typeof data.output === 'string' && data.output) ||
    (typeof data.text === 'string' && data.text) ||
    (typeof data.result === 'string' && data.result) ||
    '';
  const remoteRunId =
    (typeof data.runId === 'string' && data.runId) || (typeof data.id === 'string' && data.id) || undefined;

  return {
    output,
    remoteRunId,
    raw: data,
  };
}

export async function cancelOpenClawRun(input: {
  remoteRunId: string;
  env?: EnvLike;
  signal?: AbortSignal;
}): Promise<boolean> {
  const baseUrl = getBaseUrl(input.env);
  const { signal, timeoutId } = withTimeoutController(input.env, input.signal);

  const response = await fetch(`${baseUrl}/v1/agent/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      runId: input.remoteRunId,
    }),
    signal,
  }).finally(() => {
    clearTimeout(timeoutId);
  });

  return response.ok;
}

export async function getOpenClawRunStatus(input: {
  remoteRunId: string;
  env?: EnvLike;
  signal?: AbortSignal;
}): Promise<OpenClawStatusResult> {
  const baseUrl = getBaseUrl(input.env);
  const { signal, timeoutId } = withTimeoutController(input.env, input.signal);
  const response = await fetch(`${baseUrl}/v1/agent/runs/${encodeURIComponent(input.remoteRunId)}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    signal,
  }).finally(() => {
    clearTimeout(timeoutId);
  });

  if (!response.ok) {
    throw new Error(`OpenClaw status failed with ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const state =
    (typeof data.state === 'string' && data.state) || (typeof data.status === 'string' && data.status) || 'unknown';

  return {
    remoteRunId: input.remoteRunId,
    state,
    raw: data,
  };
}
