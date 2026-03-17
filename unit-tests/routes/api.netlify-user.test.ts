import { describe, expect, it } from 'vitest';
import { action, loader } from '~/routes/api.netlify-user';

describe('/api/netlify-user', () => {
  it('loader returns 410 after Netlify removal', async () => {
    const response = await loader({ request: new Request('http://localhost/api/netlify-user') } as any);
    expect(response.status).toBe(410);
  });

  it('action returns 410 after Netlify removal', async () => {
    const response = await action({ request: new Request('http://localhost/api/netlify-user', { method: 'POST' }) } as any);
    expect(response.status).toBe(410);
  });
});
