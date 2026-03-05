import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('~/lib/.server/auth', () => ({
  getCurrentUserFromRequest: vi.fn(),
}));

vi.mock('~/lib/.server/persistence', () => ({
  isPersistenceEnabled: vi.fn(),
  readPersistedMemory: vi.fn(),
  upsertPersistedMemory: vi.fn(),
}));

import { loader, action } from '~/routes/api.system-settings';
import { getCurrentUserFromRequest } from '~/lib/.server/auth';
import { isPersistenceEnabled, readPersistedMemory, upsertPersistedMemory } from '~/lib/.server/persistence';

describe('/api/system-settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('denies non-admin user', async () => {
    vi.mocked(isPersistenceEnabled).mockReturnValue(true);
    vi.mocked(getCurrentUserFromRequest).mockResolvedValue({
      userId: 'u2',
      username: 'user',
      isAdmin: false,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });

    const response = await loader({
      context: { cloudflare: { env: {} } },
      request: new Request('http://localhost/api/system-settings'),
    } as any);

    expect(response.status).toBe(403);
    const json = (await response.json()) as any;
    expect(json.ok).toBe(false);
  });

  it('loads normalized settings for admin', async () => {
    vi.mocked(isPersistenceEnabled).mockReturnValue(true);
    vi.mocked(getCurrentUserFromRequest).mockResolvedValue({
      userId: 'u1',
      username: 'admin',
      isAdmin: true,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    vi.mocked(readPersistedMemory).mockResolvedValue({
      apiKeys: {},
      providerSettings: {
        __systemSettings: {
          apachePhp: { enabled: true, ftpHost: 'ftp.example.com', ftpPort: 21, ftpUsername: 'x', ftpPassword: 'y', serverRootPath: '/var/www/html', publicBaseUrl: 'https://example.com' },
          n8n: { enabled: true, baseUrl: 'https://n8n.example.com', apiKey: 'k' },
        },
      },
      customPrompt: { enabled: false, instructions: '' },
      dbConfig: { provider: 'sqlite', postgresUrl: '' },
    });

    const response = await loader({
      context: { cloudflare: { env: {} } },
      request: new Request('http://localhost/api/system-settings'),
    } as any);

    const json = (await response.json()) as any;
    expect(json.ok).toBe(true);
    expect(json.settings.apachePhp.enabled).toBe(true);
    expect(json.settings.n8n.baseUrl).toBe('https://n8n.example.com');
  });

  it('persists admin system settings payload', async () => {
    vi.mocked(isPersistenceEnabled).mockReturnValue(true);
    vi.mocked(getCurrentUserFromRequest).mockResolvedValue({
      userId: 'u1',
      username: 'admin',
      isAdmin: true,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    vi.mocked(upsertPersistedMemory).mockResolvedValue(true);

    const payload = {
      settings: {
        apachePhp: {
          enabled: true,
          ftpHost: 'ftp.example.com',
          ftpPort: 22,
          ftpUsername: 'deploy',
          ftpPassword: 'secret',
          serverRootPath: '/srv/www',
          publicBaseUrl: 'https://example.com',
        },
        n8n: {
          enabled: true,
          baseUrl: 'https://n8n.example.com',
          apiKey: 'abc',
        },
      },
    };

    const response = await action({
      context: { cloudflare: { env: {} } },
      request: new Request('http://localhost/api/system-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    } as any);

    const json = (await response.json()) as any;
    expect(json.ok).toBe(true);
    expect(upsertPersistedMemory).toHaveBeenCalled();
    expect(upsertPersistedMemory).toHaveBeenCalledWith(
      {
        providerSettings: {
          __systemSettings: expect.objectContaining({
            apachePhp: payload.settings.apachePhp,
            n8n: payload.settings.n8n,
            openclaw: expect.objectContaining({
              enabled: false,
            }),
          }),
        },
      },
      {},
    );
  });
});
