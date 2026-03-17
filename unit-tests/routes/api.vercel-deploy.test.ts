import { describe, expect, it } from 'vitest';
import { action } from '~/routes/api.vercel-deploy';

describe('/api/vercel-deploy', () => {
  it('returns 410 because legacy Vercel deploy is removed', async () => {
    const response = await action({
      request: new Request('http://localhost/api/vercel-deploy', { method: 'POST' }),
    } as any);

    expect(response.status).toBe(410);
  });
});
