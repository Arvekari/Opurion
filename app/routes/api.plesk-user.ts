import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';

function normalizeHost(host: string) {
  return host.replace(/\/+$/g, '');
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = (await request.json()) as { host?: string; token?: string };
    const host = normalizeHost(body.host || '');
    const token = body.token || '';

    if (!host || !token) {
      return json({ error: 'Missing host or token' }, { status: 400 });
    }

    const [serverRes, domainsRes] = await Promise.all([
      fetch(`${host}/api/v2/server`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      }),
      fetch(`${host}/api/v2/domains`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      }),
    ]);

    if (!serverRes.ok) {
      return json({ error: `Plesk authentication failed (${serverRes.status})` }, { status: serverRes.status });
    }

    const serverData = (await serverRes.json()) as any;
    const domainsData = domainsRes.ok ? (((await domainsRes.json()) as any) || []) : [];

    return json({
      ok: true,
      user: {
        login: serverData?.data?.panelVersion || 'Plesk User',
        fullName: serverData?.data?.hostname,
      },
      stats: {
        domains: Array.isArray(domainsData)
          ? domainsData.map((domain: any) => ({ id: domain.id, name: domain.name || domain.displayName || String(domain.id) }))
          : [],
        totalDomains: Array.isArray(domainsData) ? domainsData.length : 0,
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Failed to connect to Plesk' }, { status: 500 });
  }
}
