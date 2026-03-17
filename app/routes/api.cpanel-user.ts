import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';

function normalizeHost(host: string) {
  return host.replace(/\/+$/g, '');
}

function cpanelHeaders(username: string, token: string) {
  return {
    Authorization: `cpanel ${username}:${token}`,
    Accept: 'application/json',
  };
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = (await request.json()) as { host?: string; username?: string; token?: string };
    const host = normalizeHost(body.host || '');
    const username = body.username || '';
    const token = body.token || '';

    if (!host || !username || !token) {
      return json({ error: 'Missing host, username or token' }, { status: 400 });
    }

    const domainsRes = await fetch(`${host}/execute/DomainInfo/list_domains`, {
      headers: cpanelHeaders(username, token),
    });

    if (!domainsRes.ok) {
      return json({ error: `cPanel authentication failed (${domainsRes.status})` }, { status: domainsRes.status });
    }

    const domainsData = (await domainsRes.json()) as any;
    const mainDomain = domainsData?.data?.main_domain as string | undefined;
    const addonDomains = (domainsData?.data?.addon_domains as string[]) || [];
    const parkedDomains = (domainsData?.data?.parked_domains as string[]) || [];
    const allDomains = [mainDomain, ...addonDomains, ...parkedDomains].filter(Boolean) as string[];

    return json({
      ok: true,
      user: { user: username },
      stats: {
        domains: allDomains,
        totalDomains: allDomains.length,
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Failed to connect to cPanel' }, { status: 500 });
  }
}
