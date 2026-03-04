import { type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { deployN8nWorkflow, isN8nConfigured } from '~/lib/.server/extensions/n8n/n8n-client';
import { readPersistedMemory } from '~/lib/.server/persistence';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.n8n.workflows');

type DeployWorkflowRequestBody = {
  intent: 'deploy';
  workflow?: Record<string, unknown>;
  activate?: boolean;
};

async function resolveN8nEnv(env?: Record<string, string | undefined>) {
  const resolved: Record<string, string | undefined> = {
    ...(env || {}),
  };

  if (isN8nConfigured(resolved)) {
    return resolved;
  }

  try {
    const memory = await readPersistedMemory(resolved as Record<string, any>);
    const rawN8n = memory?.providerSettings?.__systemSettings?.n8n as
      | { enabled?: unknown; baseUrl?: unknown; apiKey?: unknown }
      | undefined;

    const enabled = rawN8n?.enabled === true;
    const baseUrl = typeof rawN8n?.baseUrl === 'string' ? rawN8n.baseUrl.trim() : '';
    const apiKey = typeof rawN8n?.apiKey === 'string' ? rawN8n.apiKey.trim() : '';

    if (enabled && baseUrl && apiKey) {
      if (!resolved.N8N_BASE_URL) {
        resolved.N8N_BASE_URL = baseUrl;
      }

      if (!resolved.N8N_API_KEY) {
        resolved.N8N_API_KEY = apiKey;
      }
    }
  } catch (error) {
    logger.warn('failed to read persisted n8n settings', error);
  }

  return resolved;
}

export async function loader({ context }: LoaderFunctionArgs) {
  const env = context.cloudflare?.env as unknown as Record<string, string | undefined> | undefined;
  const resolvedEnv = await resolveN8nEnv(env);

  return Response.json({
    configured: isN8nConfigured(resolvedEnv),
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare?.env as unknown as Record<string, string | undefined> | undefined;
  const resolvedEnv = await resolveN8nEnv(env);

  try {
    const body = (await request.json()) as DeployWorkflowRequestBody;

    if (body.intent !== 'deploy') {
      return Response.json({ error: 'Unsupported intent' }, { status: 400 });
    }

    if (!body.workflow || typeof body.workflow !== 'object') {
      return Response.json({ error: 'workflow payload is required' }, { status: 400 });
    }

    if (!isN8nConfigured(resolvedEnv)) {
      return Response.json({ error: 'n8n integration is not configured' }, { status: 503 });
    }

    const result = await deployN8nWorkflow({
      workflow: body.workflow,
      activate: body.activate,
      env: resolvedEnv,
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    logger.error('n8n workflow deployment failed', error);
    return Response.json({ error: 'Failed to deploy n8n workflow' }, { status: 500 });
  }
}
