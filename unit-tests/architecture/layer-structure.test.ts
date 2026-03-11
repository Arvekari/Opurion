import { describe, expect, it } from 'vitest';

import { executeChatEngine } from '~/core/chat/engine';
import { resolveModelRoute } from '~/core/routing/model-router';
import { hasRequiredRole } from '~/platform/rbac/roles';
import { issueJwtToken } from '~/platform/auth/jwt';
import { logAuditEvent } from '~/platform/audit/logger';
import { isSqlitePersistenceEnabled } from '~/integrations/sqlite/adapter';
import { isPostgrestEnabled } from '~/integrations/postgrest/client';
import { isOpenClawConfigured } from '~/integrations/openclaw/client';
import { processMcpMessagesForRequest } from '~/integrations/mcp/adapter';
import { choosePersistenceBackend } from '~/infrastructure/database/router';
import { createMigrationPlan } from '~/infrastructure/migrations/engine';
import { loadPlatformConfig } from '~/infrastructure/config/loader';
import { encryptSecret } from '~/infrastructure/encryption/secret-box';

describe('layered structure imports', () => {
  it('exposes core routes and chat engine entry points', () => {
    expect(typeof executeChatEngine).toBe('function');
    expect(resolveModelRoute({ provider: 'openai', model: 'gpt-4o-mini' })).toBe('llm');
  });

  it('exposes platform auth/rbac/audit modules', async () => {
    expect(hasRequiredRole('global_admin', 'user')).toBe(true);

    const token = await issueJwtToken(
      { sub: 'u1', role: 'global_admin' },
      { jwtSecret: 'secret', ttlSeconds: 60 },
    );

    expect(typeof token).toBe('string');
    expect(() => logAuditEvent({ action: 'test', status: 'success' })).not.toThrow();
  });

  it('exposes integrations and infrastructure modules', async () => {
    expect(typeof isSqlitePersistenceEnabled).toBe('function');
    expect(typeof isPostgrestEnabled).toBe('function');
    expect(isOpenClawConfigured({})).toBe(false);
    expect(typeof processMcpMessagesForRequest).toBe('function');

    const backend = choosePersistenceBackend({
      configuredProvider: 'sqlite',
      postgrestReachable: false,
      allowFallbackToSqlite: true,
    });
    expect(backend.active).toBe('sqlite');

    const plan = createMigrationPlan({ engine: 'sqlite', currentVersion: 0, targetVersion: 1 });
    expect(plan.pendingVersions).toEqual([1]);

    const cfg = loadPlatformConfig({});
    expect(cfg.db.provider).toBe('sqlite');

    const encrypted = await encryptSecret('x', '0123456789abcdef0123456789abcdef');
    expect(typeof encrypted).toBe('string');
  });
});
