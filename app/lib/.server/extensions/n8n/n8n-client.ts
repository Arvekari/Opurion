type EnvLike = Record<string, string | undefined> | undefined;

export type N8nDeployInput = {
  workflow: Record<string, unknown>;
  activate?: boolean;
  env?: EnvLike;
  signal?: AbortSignal;
};

export type N8nUpdateInput = {
  workflowId?: string;
  workflow: Record<string, unknown>;
  activate?: boolean;
  env?: EnvLike;
  signal?: AbortSignal;
};

export type N8nDeployResult = {
  workflowId: string;
  active: boolean;
  raw: Record<string, unknown>;
};

export type N8nUpdateResult = {
  workflowId: string;
  active: boolean;
  raw: Record<string, unknown>;
};

function getEnvValue(env: EnvLike, key: string): string | undefined {
  const processEnv = (globalThis as any)?.process?.env;
  const value = env?.[key] ?? processEnv?.[key];

  return typeof value === 'string' ? value : undefined;
}

function getBaseUrl(env?: EnvLike): string {
  const baseUrl = getEnvValue(env, 'N8N_BASE_URL');

  if (!baseUrl) {
    throw new Error('N8N_BASE_URL is not configured');
  }

  return baseUrl.replace(/\/$/, '');
}

function getApiKey(env?: EnvLike): string {
  const apiKey = getEnvValue(env, 'N8N_API_KEY');

  if (!apiKey) {
    throw new Error('N8N_API_KEY is not configured');
  }

  return apiKey;
}

function getTimeoutMs(env?: EnvLike): number {
  const raw = getEnvValue(env, 'N8N_TIMEOUT_MS') || '30000';
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

function getWorkflowId(payload: Record<string, unknown>): string {
  const value = payload.id;

  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  throw new Error('n8n workflow id missing from create response');
}

function resolveWorkflowId(explicitWorkflowId: string | undefined, workflow: Record<string, unknown>): string {
  if (typeof explicitWorkflowId === 'string' && explicitWorkflowId.trim().length > 0) {
    return explicitWorkflowId.trim();
  }

  const fromWorkflow = workflow.id;

  if (typeof fromWorkflow === 'string' && fromWorkflow.trim().length > 0) {
    return fromWorkflow.trim();
  }

  if (typeof fromWorkflow === 'number' && Number.isFinite(fromWorkflow)) {
    return String(fromWorkflow);
  }

  throw new Error('workflowId is required for n8n update intent');
}

async function activateWorkflow(
  workflowId: string,
  env?: EnvLike,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const baseUrl = getBaseUrl(env);
  const apiKey = getApiKey(env);
  const { signal: activateSignal, timeoutId: activateTimeoutId } = withTimeoutController(env, signal);
  const activateResponse = await fetch(`${baseUrl}/api/v1/workflows/${encodeURIComponent(workflowId)}/activate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': apiKey,
    },
    signal: activateSignal,
  }).finally(() => {
    clearTimeout(activateTimeoutId);
  });

  if (!activateResponse.ok) {
    throw new Error(`n8n activate workflow failed with ${activateResponse.status}`);
  }

  return (await activateResponse.json()) as Record<string, unknown>;
}

export function isN8nConfigured(env?: EnvLike): boolean {
  return Boolean(getEnvValue(env, 'N8N_BASE_URL') && getEnvValue(env, 'N8N_API_KEY'));
}

export async function deployN8nWorkflow(input: N8nDeployInput): Promise<N8nDeployResult> {
  const baseUrl = getBaseUrl(input.env);
  const apiKey = getApiKey(input.env);
  const { signal, timeoutId } = withTimeoutController(input.env, input.signal);

  const createResponse = await fetch(`${baseUrl}/api/v1/workflows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': apiKey,
    },
    body: JSON.stringify(input.workflow),
    signal,
  }).finally(() => {
    clearTimeout(timeoutId);
  });

  if (!createResponse.ok) {
    throw new Error(`n8n create workflow failed with ${createResponse.status}`);
  }

  const created = (await createResponse.json()) as Record<string, unknown>;
  const workflowId = getWorkflowId(created);

  if (!input.activate) {
    return {
      workflowId,
      active: Boolean(created.active),
      raw: created,
    };
  }

  const activated = await activateWorkflow(workflowId, input.env, input.signal);

  return {
    workflowId,
    active: activated.active === undefined ? true : Boolean(activated.active),
    raw: {
      created,
      activated,
    },
  };
}

export async function updateN8nWorkflow(input: N8nUpdateInput): Promise<N8nUpdateResult> {
  const baseUrl = getBaseUrl(input.env);
  const apiKey = getApiKey(input.env);
  const workflowId = resolveWorkflowId(input.workflowId, input.workflow);
  const { signal, timeoutId } = withTimeoutController(input.env, input.signal);

  const updateResponse = await fetch(`${baseUrl}/api/v1/workflows/${encodeURIComponent(workflowId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': apiKey,
    },
    body: JSON.stringify(input.workflow),
    signal,
  }).finally(() => {
    clearTimeout(timeoutId);
  });

  if (!updateResponse.ok) {
    throw new Error(`n8n update workflow failed with ${updateResponse.status}`);
  }

  const updated = (await updateResponse.json()) as Record<string, unknown>;

  if (!input.activate) {
    return {
      workflowId,
      active: updated.active === undefined ? false : Boolean(updated.active),
      raw: updated,
    };
  }

  const activated = await activateWorkflow(workflowId, input.env, input.signal);

  return {
    workflowId,
    active: activated.active === undefined ? true : Boolean(activated.active),
    raw: {
      updated,
      activated,
    },
  };
}
