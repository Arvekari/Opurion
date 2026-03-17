import { describe, expect, it } from 'vitest';
import { action, loader } from '~/routes/api.vercel-user';

describe('/api/vercel-user', () => {
  it('loader returns 410 after Vercel removal', async () => {
    const response = await loader({ request: new Request('http://localhost/api/vercel-user') } as any);
    expect(response.status).toBe(410);
  });

  it('action returns 410 after Vercel removal', async () => {
    const response = await action({ request: new Request('http://localhost/api/vercel-user', { method: 'POST' }) } as any);
    expect(response.status).toBe(410);
  });
});
