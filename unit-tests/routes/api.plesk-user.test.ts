import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

globalThis.fetch = fetchMock as any;

import { action } from '~/routes/api.plesk-user';

describe('/api/plesk-user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 on missing credentials', async () => {
    const response = await action({
      request: new Request('http://localhost/api/plesk-user', { method: 'POST', body: JSON.stringify({}) }),
    } as any);

    expect(response.status).toBe(400);
  });

  it('returns connection info on success', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { panelVersion: '18.0.0', hostname: 'host1' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, name: 'example.com' }]), { status: 200 }));

    const response = await action({
      request: new Request('http://localhost/api/plesk-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: 'https://plesk.example.com:8443', token: 't1' }),
      }),
    } as any);

    const data = (await response.json()) as any;
    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.stats.totalDomains).toBe(1);
  });
});
