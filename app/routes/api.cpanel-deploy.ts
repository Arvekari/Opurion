import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import path from 'node:path';

interface DeployBody {
  host: string;
  username: string;
  token: string;
  rootPath?: string;
  files: Record<string, string>;
}

function normalizeHost(host: string) {
  return host.replace(/\/+$/g, '');
}

function headers(username: string, token: string) {
  return {
    Authorization: `cpanel ${username}:${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

async function ensureDirectory(host: string, username: string, token: string, targetDir: string) {
  const parentDir = path.posix.dirname(targetDir);
  const dirName = path.posix.basename(targetDir);

  const body = new URLSearchParams({
    dir: parentDir,
    name: dirName,
  });

  const response = await fetch(`${host}/execute/Fileman/mkdir`, {
    method: 'POST',
    headers: headers(username, token),
    body,
  });

  if (!response.ok && response.status !== 409) {
    const text = await response.text();
    throw new Error(`Failed creating cPanel directory ${targetDir}: ${text || response.statusText}`);
  }
}

async function writeFile(host: string, username: string, token: string, filePath: string, content: string) {
  const dir = path.posix.dirname(filePath);
  const fileName = path.posix.basename(filePath);

  const body = new URLSearchParams({
    dir,
    file: fileName,
    content,
    overwrite: '1',
  });

  const response = await fetch(`${host}/execute/Fileman/save_file_content`, {
    method: 'POST',
    headers: headers(username, token),
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed writing ${filePath}: ${text || response.statusText}`);
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = (await request.json()) as DeployBody;
    const host = normalizeHost(body.host || '');
    const username = body.username || '';
    const token = body.token || '';
    const rootPath = (body.rootPath || '/public_html').replace(/\/+$/g, '');

    if (!host || !username || !token) {
      return json({ error: 'Missing cPanel host, username or token' }, { status: 400 });
    }

    const files = body.files || {};

    if (Object.keys(files).length === 0) {
      return json({ error: 'No build files found to deploy' }, { status: 400 });
    }

    const dirs = new Set<string>();

    for (const filePath of Object.keys(files)) {
      const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
      const targetPath = `${rootPath}${normalizedPath}`;
      const dir = path.posix.dirname(targetPath);

      let current = dir;

      while (current && current !== '.' && current !== '/' && !dirs.has(current)) {
        dirs.add(current);
        current = path.posix.dirname(current);
      }
    }

    const sortedDirs = [...dirs].sort((a, b) => a.length - b.length);

    for (const dir of sortedDirs) {
      await ensureDirectory(host, username, token, dir);
    }

    for (const [filePath, content] of Object.entries(files)) {
      const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
      await writeFile(host, username, token, `${rootPath}${normalizedPath}`, content);
    }

    return json({
      success: true,
      url: null,
      message: 'Deployment uploaded to cPanel file manager successfully',
    });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : 'cPanel deployment failed',
      },
      { status: 500 },
    );
  }
}
