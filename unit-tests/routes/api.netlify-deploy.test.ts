import { describe, expect, it } from 'vitest';
import { action } from '~/routes/api.netlify-deploy';

describe('/api/netlify-deploy', () => {
  it('returns 410 because legacy Netlify deploy is removed', async () => {
    const response = await action({
      request: new Request('http://localhost/api/netlify-deploy', { method: 'POST' }),
    } as any);

    expect(response.status).toBe(410);
  });
});
