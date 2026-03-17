import { describe, expect, it } from 'vitest';
import { action } from '~/routes/api.cpanel-deploy';

describe('/api/cpanel-deploy', () => {
  it('returns 400 when required connection fields are missing', async () => {
    const response = await action({
      request: new Request('http://localhost/api/cpanel-deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: { '/index.html': 'x' } }),
      }),
    } as any);

    expect(response.status).toBe(400);
  });
});
