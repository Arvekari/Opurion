import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';

interface DeployBody {
  host: string;
  token: string;
  rootPath?: string;
  files: Record<string, string>;
}

function normalizeHost(host: string) {
  return host.replace(/\/+$/g, '');
}

async function tryWriteViaPleskApi(host: string, token: string, targetPath: string, content: string) {
  const directPath = targetPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const directResponse = await fetch(`${host}/api/v2/files/${directPath}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain; charset=utf-8',
      Accept: 'application/json',
    },
    body: content,
  });

  if (directResponse.ok) {
    return;
  }

  const fallbackResponse = await fetch(`${host}/api/v2/files/write`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ path: targetPath, content }),
  });

  if (!fallbackResponse.ok) {
    const directText = await directResponse.text().catch(() => '');
    const fallbackText = await fallbackResponse.text().catch(() => '');
    throw new Error(
      `Plesk API write failed for ${targetPath}. ISP/API limitation or endpoint unsupported. Direct: ${directResponse.status} ${directText}; Fallback: ${fallbackResponse.status} ${fallbackText}`,
    );
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = (await request.json()) as DeployBody;
    const host = normalizeHost(body.host || '');
    const token = body.token || '';
    const rootPath = (body.rootPath || '/httpdocs').replace(/\/+$/g, '');

    if (!host || !token) {
      return json({ error: 'Missing Plesk host or token' }, { status: 400 });
    }

    const files = body.files || {};

    if (Object.keys(files).length === 0) {
      return json({ error: 'No build files found to deploy' }, { status: 400 });
    }

    const probe = await fetch(`${host}/api/v2/server`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (!probe.ok) {
      return json({ error: `Plesk authentication failed (${probe.status})` }, { status: probe.status });
    }

    for (const [filePath, content] of Object.entries(files)) {
      const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
      const targetPath = `${rootPath}${normalizedPath}`;
      await tryWriteViaPleskApi(host, token, targetPath, content);
    }

    return json({
      success: true,
      url: null,
      message: 'Deployment uploaded to Plesk file API successfully',
    });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : 'Plesk deployment failed',
      },
      { status: 500 },
    );
  }
}
