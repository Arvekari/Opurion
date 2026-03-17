import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

globalThis.fetch = fetchMock as any;

import { action } from '~/routes/api.cpanel-user';

describe('/api/cpanel-user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 on missing credentials', async () => {
    const response = await action({
      request: new Request('http://localhost/api/cpanel-user', { method: 'POST', body: JSON.stringify({}) }),
    } as any);

    expect(response.status).toBe(400);
  });

  it('returns connection info on success', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { main_domain: 'example.com', addon_domains: ['a.example.com'] } }), { status: 200 }),
    );

    const response = await action({
      request: new Request('http://localhost/api/cpanel-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: 'https://cpanel.example.com:2083', username: 'u1', token: 't1' }),
      }),
    } as any);

    const data = (await response.json()) as any;
    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.stats.totalDomains).toBe(2);
  });
});
