import type { PlatformRole } from '~/platform/security/authz';

import { createScopedLogger } from '~/utils/logger';
import { CURRENT_SCHEMA_VERSION } from '~/platform/persistence/schema-version';

type PersistedMemory = {
  apiKeys: Record<string, string>;
  providerSettings: Record<string, any>;
  customPrompt: {
    enabled: boolean;
    instructions: string;
  };
  dbConfig: {
    provider: 'sqlite' | 'postgres';
    postgresUrl: string;
  };
};

type VectorRecord = {
  id: number;
  userId: string;
  namespace: string;
  sourceId: string;
  content: string;
  metadata: Record<string, any>;
  embedding: number[];
  createdAt: string;
};

export type AgentRunPersistedRecord = {
  runId: string;
  state: string;
  payload: Record<string, any>;
  createdAt: string;
  updatedAt: string;
};

type SqliteContext = {
  db: any;
  fs: any;
  path: any;
  sqlitePath: string;
};

const logger = createScopedLogger('sqlite-memory');

let sqliteContextPromise: Promise<SqliteContext | null> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
const PROCESS_STARTED_AT = Date.now();

function getEnvValue(env: Record<string, any> | undefined, key: string): string | undefined {
  const processEnv = (globalThis as any)?.process?.env;
  return env?.[key] ?? processEnv?.[key];
}

function isEnabled(env?: Record<string, any>): boolean {
  const flag = getEnvValue(env, 'BOLT_SQLITE_PERSISTENCE_ENABLED');

  if (typeof flag === 'string') {
    return flag.toLowerCase() !== 'false';
  }

  // Local/dev default: keep persistence on so auth bootstrap (signup/login) works out of the box.
  return true;
}

function getSqlitePath(env?: Record<string, any>): string {
  const configuredPath = getEnvValue(env, 'BOLT_SQLITE_PERSISTENCE_PATH');

  if (configuredPath) {
    return configuredPath;
  }

  if (getEnvValue(env, 'RUNNING_IN_DOCKER') === 'true') {
    return '/data/bolt-memory.sqlite';
  }

  return '.bolt-memory.sqlite';
}

async function ensureContext(env?: Record<string, any>): Promise<SqliteContext | null> {
  if (!isEnabled(env)) {
    return null;
  }

  if (!sqliteContextPromise) {
    sqliteContextPromise = (async () => {
      try {
        const [sqlJsModule, fsModule, pathModule, moduleModule] = await Promise.all([
          import('sql.js/dist/sql-wasm.js'),
          import('node:fs/promises'),
          import('node:path'),
          import('node:module'),
        ]);

        const initSqlJs = (sqlJsModule as any).default;
        const fs = (fsModule as any).default ?? (fsModule as any);
        const path = (pathModule as any).default ?? (pathModule as any);
        const createRequire = (moduleModule as any).createRequire as (filename: string) => NodeRequire;
        const requireFromHere = createRequire(import.meta.url);

        const sqlWasmJsPath = requireFromHere.resolve('sql.js/dist/sql-wasm.js');
        const sqlJsDistDir = path.dirname(sqlWasmJsPath);
        const wasmPath = path.join(sqlJsDistDir, 'sql-wasm.wasm');

        let wasmBinary: Uint8Array | undefined;

        try {
          const wasmBytes = await fs.readFile(wasmPath);
          wasmBinary = new Uint8Array(wasmBytes);
        } catch (error) {
          logger.warn('Failed to preload sql.js wasm binary, falling back to locateFile loader', error);
        }

        const SQL = await initSqlJs({
          locateFile: (file: string) => path.join(sqlJsDistDir, file),
          ...(wasmBinary ? { wasmBinary } : {}),
        });
        const sqlitePath = getSqlitePath(env);

        await fs.mkdir(path.dirname(sqlitePath), { recursive: true });

        let db: any;

        try {
          const dbBytes = await fs.readFile(sqlitePath);
          db = new SQL.Database(new Uint8Array(dbBytes));
        } catch {
          db = new SQL.Database();
        }

        db.run(`
          CREATE TABLE IF NOT EXISTS schema_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS app_memory (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            api_keys TEXT NOT NULL,
            provider_settings TEXT NOT NULL,
            custom_prompt TEXT NOT NULL DEFAULT '{}',
            db_config TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT NOT NULL
          );
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            is_admin INTEGER NOT NULL DEFAULT 0,
            role TEXT NOT NULL DEFAULT 'user',
            created_at TEXT NOT NULL
          );
        `);

        // Migration: add email column to existing databases
        try {
          db.run('ALTER TABLE users ADD COLUMN email TEXT UNIQUE;');
        } catch {
          // Column already exists or table doesn't exist yet, ignore
        }

        try {
          db.run("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';");
        } catch {
          // Column already exists or table doesn't exist yet, ignore
        }

        try {
          db.run("UPDATE users SET role = CASE WHEN is_admin = 1 THEN 'global_admin' ELSE 'user' END WHERE role IS NULL OR role = '' OR role = 'admin' OR (is_admin = 1 AND role = 'user');");
        } catch {
          // Ignore migration update failures on older or partial schemas
        }

        db.run(`
          CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
          );
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS user_memory (
            user_id TEXT PRIMARY KEY,
            api_keys TEXT NOT NULL,
            provider_settings TEXT NOT NULL,
            custom_prompt TEXT NOT NULL,
            db_config TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
          );
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS user_vectors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            namespace TEXT NOT NULL,
            source_id TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata TEXT NOT NULL,
            embedding TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
          );
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS collab_projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            owner_user_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(owner_user_id) REFERENCES users(id)
          );
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS collab_project_members (
            project_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL,
            invited_by_user_id TEXT,
            created_at TEXT NOT NULL,
            PRIMARY KEY(project_id, user_id),
            FOREIGN KEY(project_id) REFERENCES collab_projects(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(invited_by_user_id) REFERENCES users(id)
          );
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS collab_conversations (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            created_by_user_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(project_id) REFERENCES collab_projects(id) ON DELETE CASCADE,
            FOREIGN KEY(created_by_user_id) REFERENCES users(id)
          );
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS collab_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(conversation_id) REFERENCES collab_conversations(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id)
          );
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS collab_branches (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            name TEXT NOT NULL,
            owner_user_id TEXT NOT NULL,
            source_branch_id TEXT,
            is_main INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active',
            merged_into_branch_id TEXT,
            created_at TEXT NOT NULL,
            merged_at TEXT,
            UNIQUE(conversation_id, name),
            FOREIGN KEY(conversation_id) REFERENCES collab_conversations(id) ON DELETE CASCADE,
            FOREIGN KEY(owner_user_id) REFERENCES users(id),
            FOREIGN KEY(source_branch_id) REFERENCES collab_branches(id),
            FOREIGN KEY(merged_into_branch_id) REFERENCES collab_branches(id)
          );
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS collab_branch_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            branch_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(branch_id) REFERENCES collab_branches(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id)
          );
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS collab_artifacts (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            owner_user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            artifact_type TEXT NOT NULL,
            visibility TEXT NOT NULL DEFAULT 'private',
            content TEXT NOT NULL,
            metadata TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(project_id) REFERENCES collab_projects(id) ON DELETE CASCADE,
            FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
          );
        `);

        db.run(`
          CREATE INDEX IF NOT EXISTS idx_artifacts_project ON collab_artifacts(project_id) WHERE project_id IS NOT NULL;
        `);

        db.run(`
          CREATE INDEX IF NOT EXISTS idx_artifacts_owner ON collab_artifacts(owner_user_id);
        `);

        db.run(`
          CREATE INDEX IF NOT EXISTS idx_artifacts_visibility ON collab_artifacts(visibility);
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS agent_runs (
            run_id TEXT PRIMARY KEY,
            state TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `);

        db.run(
          `
            INSERT INTO schema_meta (key, value, updated_at)
            VALUES ('schema_version', ?, ?)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updated_at = excluded.updated_at;
          `,
          [String(CURRENT_SCHEMA_VERSION), new Date().toISOString()],
        );

        const row = db.exec('SELECT id FROM app_memory WHERE id = 1;');

        if (!row.length) {
          db.run(
            'INSERT INTO app_memory (id, api_keys, provider_settings, custom_prompt, db_config, updated_at) VALUES (1, ?, ?, ?, ?, ?);',
            [
              JSON.stringify({}),
              JSON.stringify({}),
              JSON.stringify({ enabled: false, instructions: '' }),
              JSON.stringify({ provider: 'sqlite', postgresUrl: '' }),
              new Date().toISOString(),
            ],
          );

          const bytes = db.export();
          await fs.writeFile(sqlitePath, bytes);
        }

        logger.info(`SQLite persistence enabled at ${sqlitePath}`);

        return { db, fs, path, sqlitePath };
      } catch (error) {
        logger.warn('SQLite persistence unavailable, continuing without it', error);
        return null;
      }
    })();
  }

  return sqliteContextPromise;
}

function parseJsonRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value: unknown): number[] {
  if (!value || typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((x) => (typeof x === 'number' ? x : 0)) : [];
  } catch {
    return [];
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function save(ctx: SqliteContext): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    const bytes = ctx.db.export();
    await ctx.fs.writeFile(ctx.sqlitePath, bytes);
  });

  await writeQueue;
}

export async function readPersistedMemory(env?: Record<string, any>): Promise<PersistedMemory | null> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return null;
  }

  const result = ctx.db.exec(
    'SELECT api_keys, provider_settings, custom_prompt, db_config FROM app_memory WHERE id = 1;',
  );

  if (!result.length || !result[0]?.values?.length) {
    return {
      apiKeys: {},
      providerSettings: {},
      customPrompt: { enabled: false, instructions: '' },
      dbConfig: { provider: 'sqlite', postgresUrl: '' },
    };
  }

  const [apiKeysRaw, providerSettingsRaw, customPromptRaw, dbConfigRaw] = result[0].values[0] as [
    string,
    string,
    string,
    string,
  ];
  const customPromptParsed = parseJsonRecord(customPromptRaw);
  const dbConfigParsed = parseJsonRecord(dbConfigRaw);

  return {
    apiKeys: parseJsonRecord(apiKeysRaw),
    providerSettings: parseJsonRecord(providerSettingsRaw),
    customPrompt: {
      enabled: !!customPromptParsed.enabled,
      instructions: typeof customPromptParsed.instructions === 'string' ? customPromptParsed.instructions : '',
    },
    dbConfig: {
      provider: dbConfigParsed.provider === 'postgres' ? 'postgres' : 'sqlite',
      postgresUrl: typeof dbConfigParsed.postgresUrl === 'string' ? dbConfigParsed.postgresUrl : '',
    },
  };
}

export async function upsertPersistedMemory(
  input: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, any>;
    customPrompt?: { enabled?: boolean; instructions?: string };
    dbConfig?: { provider?: 'sqlite' | 'postgres'; postgresUrl?: string };
  },
  env?: Record<string, any>,
): Promise<boolean> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return false;
  }

  const current = (await readPersistedMemory(env)) || {
    apiKeys: {},
    providerSettings: {},
    customPrompt: { enabled: false, instructions: '' },
    dbConfig: { provider: 'sqlite', postgresUrl: '' },
  };

  const mergedApiKeys = input.apiKeys ? { ...current.apiKeys, ...input.apiKeys } : current.apiKeys;
  const mergedProviderSettings = input.providerSettings
    ? { ...current.providerSettings, ...input.providerSettings }
    : current.providerSettings;
  const mergedCustomPrompt = input.customPrompt
    ? {
        enabled: input.customPrompt.enabled ?? current.customPrompt.enabled,
        instructions:
          typeof input.customPrompt.instructions === 'string'
            ? input.customPrompt.instructions
            : current.customPrompt.instructions,
      }
    : current.customPrompt;
  const mergedDbConfig = input.dbConfig
    ? {
        provider: input.dbConfig.provider === 'postgres' ? 'postgres' : 'sqlite',
        postgresUrl:
          typeof input.dbConfig.postgresUrl === 'string' ? input.dbConfig.postgresUrl : current.dbConfig.postgresUrl,
      }
    : current.dbConfig;

  ctx.db.run(
    'UPDATE app_memory SET api_keys = ?, provider_settings = ?, custom_prompt = ?, db_config = ?, updated_at = ? WHERE id = 1;',
    [
      JSON.stringify(mergedApiKeys),
      JSON.stringify(mergedProviderSettings),
      JSON.stringify(mergedCustomPrompt),
      JSON.stringify(mergedDbConfig),
      new Date().toISOString(),
    ],
  );

  await save(ctx);

  return true;
}

export async function getUserCount(env?: Record<string, any>): Promise<number> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return 0;
  }

  const result = ctx.db.exec('SELECT COUNT(*) as count FROM users;');

  return Number(result?.[0]?.values?.[0]?.[0] || 0);
}

export async function createUser(
  input: { username: string; email?: string; passwordHash: string; passwordSalt: string; isAdmin?: boolean; role?: PlatformRole },
  env?: Record<string, any>,
): Promise<{ id: string; username: string; email?: string; isAdmin: boolean; role: PlatformRole } | null> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return null;
  }

  const id = (globalThis as any)?.crypto?.randomUUID?.() || `user_${Date.now()}`;
  const createdAt = new Date().toISOString();

  const role = input.role || (input.isAdmin ? 'global_admin' : 'user');

  try {
    ctx.db.run(
      'INSERT INTO users (id, username, email, password_hash, password_salt, is_admin, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?);',
      [
        id,
        input.username,
        input.email || null,
        input.passwordHash,
        input.passwordSalt,
        role !== 'user' ? 1 : 0,
        role,
        createdAt,
      ],
    );
    await save(ctx);

    return { id, username: input.username, email: input.email, isAdmin: role !== 'user', role };
  } catch {
    return null;
  }
}

export async function findUserByUsername(
  username: string,
  env?: Record<string, any>,
): Promise<{
  id: string;
  username: string;
  email?: string;
  passwordHash: string;
  passwordSalt: string;
  isAdmin: boolean;
  role: PlatformRole;
} | null> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return null;
  }

  const result = ctx.db.exec(
    'SELECT id, username, email, password_hash, password_salt, is_admin, role FROM users WHERE username = ?;',
    [username],
  );

  const row = result?.[0]?.values?.[0];

  if (!row) {
    return null;
  }

  return {
    id: String(row[0]),
    username: String(row[1]),
    email: row[2] ? String(row[2]) : undefined,
    passwordHash: String(row[3]),
    passwordSalt: String(row[4]),
    isAdmin: Number(row[5]) === 1,
    role: ((row[6] ? String(row[6]) : Number(row[5]) === 1 ? 'global_admin' : 'user') as PlatformRole),
  };
}

export async function findUserByEmail(
  email: string,
  env?: Record<string, any>,
): Promise<{
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  isAdmin: boolean;
  role: PlatformRole;
} | null> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return null;
  }

  const result = ctx.db.exec(
    'SELECT id, username, email, password_hash, password_salt, is_admin, role FROM users WHERE email = ?;',
    [email.toLowerCase()],
  );

  const row = result?.[0]?.values?.[0];

  if (!row) {
    return null;
  }

  return {
    id: String(row[0]),
    username: String(row[1]),
    email: String(row[2]),
    passwordHash: String(row[3]),
    passwordSalt: String(row[4]),
    isAdmin: Number(row[5]) === 1,
    role: ((row[6] ? String(row[6]) : Number(row[5]) === 1 ? 'global_admin' : 'user') as PlatformRole),
  };
}

export async function createSession(
  userId: string,
  env?: Record<string, any>,
  ttlHours: number = 48,
): Promise<{ token: string; expiresAt: string } | null> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return null;
  }

  const token = (globalThis as any)?.crypto?.randomUUID?.() || `sess_${Date.now()}`;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + ttlHours * 60 * 60 * 1000).toISOString();

  ctx.db.run('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?);', [
    token,
    userId,
    expiresAt,
    createdAt.toISOString(),
  ]);

  await save(ctx);

  return { token, expiresAt };
}

export async function getSessionUser(
  token: string,
  env?: Record<string, any>,
): Promise<{ userId: string; username: string; isAdmin: boolean; role: PlatformRole; expiresAt: string } | null> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return null;
  }

  const result = ctx.db.exec(
    `
      SELECT s.user_id, u.username, u.is_admin, u.role, s.expires_at, s.created_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ?;
    `,
    [token],
  );

  const row = result?.[0]?.values?.[0];

  if (!row) {
    return null;
  }

  const expiresAt = String(row[4]);
  const createdAt = String(row[5] || '');

  if (new Date(expiresAt).getTime() < Date.now()) {
    await deleteSession(token, env);
    return null;
  }

  if (!createdAt || new Date(createdAt).getTime() < PROCESS_STARTED_AT) {
    await deleteSession(token, env);
    return null;
  }

  return {
    userId: String(row[0]),
    username: String(row[1]),
    isAdmin: Number(row[2]) === 1,
    role: ((row[3] ? String(row[3]) : Number(row[2]) === 1 ? 'global_admin' : 'user') as PlatformRole),
    expiresAt,
  };
}

export async function listUsers(
  env?: Record<string, any>,
): Promise<Array<{ id: string; username: string; email?: string; isAdmin: boolean; role: PlatformRole; createdAt: string }>> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return [];
  }

  const result = ctx.db.exec('SELECT id, username, email, is_admin, role, created_at FROM users ORDER BY created_at ASC;');
  const rows = result?.[0]?.values || [];

  return rows.map((row: any[]) => ({
    id: String(row[0]),
    username: String(row[1]),
    email: row[2] ? String(row[2]) : undefined,
    isAdmin: Number(row[3]) === 1,
    role: ((row[4] ? String(row[4]) : Number(row[3]) === 1 ? 'global_admin' : 'user') as PlatformRole),
    createdAt: String(row[5]),
  }));
}

export async function updateUserRecord(
  input: { id: string; username?: string; email?: string | null; role?: PlatformRole },
  env?: Record<string, any>,
): Promise<boolean> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return false;
  }

  const existing = ctx.db.exec('SELECT id FROM users WHERE id = ?;', [input.id]);

  if (!existing?.[0]?.values?.[0]) {
    return false;
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (input.username !== undefined) {
    updates.push('username = ?');
    params.push(input.username);
  }

  if (input.email !== undefined) {
    updates.push('email = ?');
    params.push(input.email || null);
  }

  if (input.role !== undefined) {
    updates.push('role = ?');
    params.push(input.role);
    updates.push('is_admin = ?');
    params.push(input.role !== 'user' ? 1 : 0);
  }

  if (updates.length === 0) {
    return true;
  }

  ctx.db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?;`, [...params, input.id]);
  await save(ctx);

  return true;
}

export async function updateUserPassword(
  input: { id: string; passwordHash: string; passwordSalt: string },
  env?: Record<string, any>,
): Promise<boolean> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return false;
  }

  ctx.db.run('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?;', [input.passwordHash, input.passwordSalt, input.id]);
  await save(ctx);

  return true;
}

export async function deleteUserRecord(id: string, env?: Record<string, any>): Promise<boolean> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return false;
  }

  ctx.db.run('DELETE FROM sessions WHERE user_id = ?;', [id]);
  ctx.db.run('DELETE FROM user_memory WHERE user_id = ?;', [id]);
  ctx.db.run('DELETE FROM users WHERE id = ?;', [id]);
  await save(ctx);

  return true;
}

export async function deleteSession(token: string, env?: Record<string, any>): Promise<void> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return;
  }

  ctx.db.run('DELETE FROM sessions WHERE token = ?;', [token]);
  await save(ctx);
}

export async function readPersistedMemoryForUser(
  userId: string,
  env?: Record<string, any>,
): Promise<PersistedMemory | null> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return null;
  }

  const result = ctx.db.exec(
    'SELECT api_keys, provider_settings, custom_prompt, db_config FROM user_memory WHERE user_id = ?;',
    [userId],
  );

  if (!result.length || !result[0]?.values?.length) {
    return {
      apiKeys: {},
      providerSettings: {},
      customPrompt: { enabled: false, instructions: '' },
      dbConfig: { provider: 'sqlite', postgresUrl: '' },
    };
  }

  const [apiKeysRaw, providerSettingsRaw, customPromptRaw, dbConfigRaw] = result[0].values[0] as [
    string,
    string,
    string,
    string,
  ];
  const customPromptParsed = parseJsonRecord(customPromptRaw);
  const dbConfigParsed = parseJsonRecord(dbConfigRaw);

  return {
    apiKeys: parseJsonRecord(apiKeysRaw),
    providerSettings: parseJsonRecord(providerSettingsRaw),
    customPrompt: {
      enabled: !!customPromptParsed.enabled,
      instructions: typeof customPromptParsed.instructions === 'string' ? customPromptParsed.instructions : '',
    },
    dbConfig: {
      provider: dbConfigParsed.provider === 'postgres' ? 'postgres' : 'sqlite',
      postgresUrl: typeof dbConfigParsed.postgresUrl === 'string' ? dbConfigParsed.postgresUrl : '',
    },
  };
}

export async function upsertPersistedMemoryForUser(
  userId: string,
  input: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, any>;
    customPrompt?: { enabled?: boolean; instructions?: string };
    dbConfig?: { provider?: 'sqlite' | 'postgres'; postgresUrl?: string };
  },
  env?: Record<string, any>,
): Promise<boolean> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return false;
  }

  const current = (await readPersistedMemoryForUser(userId, env)) || {
    apiKeys: {},
    providerSettings: {},
    customPrompt: { enabled: false, instructions: '' },
    dbConfig: { provider: 'sqlite', postgresUrl: '' },
  };

  const mergedApiKeys = input.apiKeys ? { ...current.apiKeys, ...input.apiKeys } : current.apiKeys;
  const mergedProviderSettings = input.providerSettings
    ? { ...current.providerSettings, ...input.providerSettings }
    : current.providerSettings;
  const mergedCustomPrompt = input.customPrompt
    ? {
        enabled: input.customPrompt.enabled ?? current.customPrompt.enabled,
        instructions:
          typeof input.customPrompt.instructions === 'string'
            ? input.customPrompt.instructions
            : current.customPrompt.instructions,
      }
    : current.customPrompt;
  const mergedDbConfig = input.dbConfig
    ? {
        provider: input.dbConfig.provider === 'postgres' ? 'postgres' : 'sqlite',
        postgresUrl:
          typeof input.dbConfig.postgresUrl === 'string' ? input.dbConfig.postgresUrl : current.dbConfig.postgresUrl,
      }
    : current.dbConfig;

  ctx.db.run(
    `
      INSERT INTO user_memory (user_id, api_keys, provider_settings, custom_prompt, db_config, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        api_keys = excluded.api_keys,
        provider_settings = excluded.provider_settings,
        custom_prompt = excluded.custom_prompt,
        db_config = excluded.db_config,
        updated_at = excluded.updated_at;
    `,
    [
      userId,
      JSON.stringify(mergedApiKeys),
      JSON.stringify(mergedProviderSettings),
      JSON.stringify(mergedCustomPrompt),
      JSON.stringify(mergedDbConfig),
      new Date().toISOString(),
    ],
  );

  await save(ctx);

  return true;
}

export async function upsertUserVector(
  input: {
    userId: string;
    namespace: string;
    sourceId: string;
    content: string;
    embedding: number[];
    metadata?: Record<string, any>;
  },
  env?: Record<string, any>,
): Promise<void> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return;
  }

  ctx.db.run(
    `
      INSERT INTO user_vectors (user_id, namespace, source_id, content, metadata, embedding, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `,
    [
      input.userId,
      input.namespace,
      input.sourceId,
      input.content,
      JSON.stringify(input.metadata || {}),
      JSON.stringify(input.embedding || []),
      new Date().toISOString(),
    ],
  );

  await save(ctx);
}

export async function searchUserVectors(
  input: {
    userId: string;
    namespace: string;
    queryEmbedding: number[];
    limit?: number;
  },
  env?: Record<string, any>,
): Promise<Array<VectorRecord & { score: number }>> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return [];
  }

  const result = ctx.db.exec(
    `
      SELECT id, user_id, namespace, source_id, content, metadata, embedding, created_at
      FROM user_vectors
      WHERE user_id = ? AND namespace = ?;
    `,
    [input.userId, input.namespace],
  );

  const rows = (result?.[0]?.values || []) as any[];
  const vectors: Array<VectorRecord & { score: number }> = rows.map((row) => {
    const embedding = parseJsonArray(row[6]);

    return {
      id: Number(row[0]),
      userId: String(row[1]),
      namespace: String(row[2]),
      sourceId: String(row[3]),
      content: String(row[4]),
      metadata: parseJsonRecord(row[5]),
      embedding,
      createdAt: String(row[7]),
      score: cosineSimilarity(input.queryEmbedding, embedding),
    };
  });

  return vectors.sort((a, b) => b.score - a.score).slice(0, Math.max(1, input.limit || 5));
}

export type CollabProject = {
  id: string;
  name: string;
  ownerUserId: string;
  role: 'owner' | 'editor' | 'viewer';
  createdAt: string;
};

export type CollabProjectMember = {
  userId: string;
  username: string;
  role: 'owner' | 'editor' | 'viewer';
  addedAt: string;
};

export type CollabConversation = {
  id: string;
  projectId: string;
  title: string;
  createdByUserId: string;
  createdAt: string;
};

export type CollabMessage = {
  id: number;
  conversationId: string;
  userId: string;
  username: string;
  role: string;
  content: string;
  createdAt: string;
};

export type CollabBranch = {
  id: string;
  conversationId: string;
  name: string;
  ownerUserId: string;
  sourceBranchId: string | null;
  isMain: boolean;
  status: 'active' | 'merged';
  mergedIntoBranchId: string | null;
  createdAt: string;
  mergedAt: string | null;
};

export type CollabArtifact = {
  id: string;
  projectId: string | null;
  ownerUserId: string;
  name: string;
  description: string | null;
  artifactType: 'module' | 'component' | 'snippet' | 'asset';
  visibility: 'private' | 'project' | 'public';
  content: string;
  metadata: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
};

export async function createCollabProject(
  input: { ownerUserId: string; name: string },
  env?: Record<string, any>,
): Promise<CollabProject | null> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return null;
  }

  const id = (globalThis as any)?.crypto?.randomUUID?.() || `project_${Date.now()}`;
  const createdAt = new Date().toISOString();

  ctx.db.run('INSERT INTO collab_projects (id, name, owner_user_id, created_at) VALUES (?, ?, ?, ?);', [
    id,
    input.name,
    input.ownerUserId,
    createdAt,
  ]);

  ctx.db.run(
    'INSERT INTO collab_project_members (project_id, user_id, role, invited_by_user_id, created_at) VALUES (?, ?, ?, ?, ?);',
    [id, input.ownerUserId, 'owner', input.ownerUserId, createdAt],
  );

  await save(ctx);

  return {
    id,
    name: input.name,
    ownerUserId: input.ownerUserId,
    role: 'owner',
    createdAt,
  };
}

export async function listCollabProjectsForUser(userId: string, env?: Record<string, any>): Promise<CollabProject[]> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return [];
  }

  const result = ctx.db.exec(
    `
      SELECT p.id, p.name, p.owner_user_id, p.created_at, m.role
      FROM collab_projects p
      JOIN collab_project_members m ON m.project_id = p.id
      WHERE m.user_id = ?
      ORDER BY p.created_at DESC;
    `,
    [userId],
  );

  const rows = result?.[0]?.values || [];

  return rows.map((row: any[]) => ({
    id: String(row[0]),
    name: String(row[1]),
    ownerUserId: String(row[2]),
    createdAt: String(row[3]),
    role: (String(row[4]) as 'owner' | 'editor' | 'viewer') || 'viewer',
  }));
}

async function hasCollabProjectAccess(projectId: string, userId: string, env?: Record<string, any>): Promise<boolean> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return false;
  }

  const result = ctx.db.exec('SELECT role FROM collab_project_members WHERE project_id = ? AND user_id = ? LIMIT 1;', [
    projectId,
    userId,
  ]);

  return !!result?.[0]?.values?.[0];
}

export async function addCollabProjectMember(
  input: {
    projectId: string;
    targetUserId: string;
    invitedByUserId: string;
    role?: 'editor' | 'viewer';
  },
  env?: Record<string, any>,
): Promise<boolean> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return false;
  }

  const hasAccess = await hasCollabProjectAccess(input.projectId, input.invitedByUserId, env);

  if (!hasAccess) {
    return false;
  }

  const role = input.role || 'editor';

  ctx.db.run(
    `
      INSERT INTO collab_project_members (project_id, user_id, role, invited_by_user_id, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(project_id, user_id) DO UPDATE SET
        role = excluded.role,
        invited_by_user_id = excluded.invited_by_user_id;
    `,
    [input.projectId, input.targetUserId, role, input.invitedByUserId, new Date().toISOString()],
  );

  await save(ctx);

  return true;
}

export async function listCollabProjectMembers(
  projectId: string,
  requesterUserId: string,
  env?: Record<string, any>,
): Promise<CollabProjectMember[]> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return [];
  }

  const hasAccess = await hasCollabProjectAccess(projectId, requesterUserId, env);

  if (!hasAccess) {
    return [];
  }

  const result = ctx.db.exec(
    `
      SELECT m.user_id, u.username, m.role, m.created_at
      FROM collab_project_members m
      JOIN users u ON u.id = m.user_id
      WHERE m.project_id = ?
      ORDER BY m.created_at ASC;
    `,
    [projectId],
  );

  const rows = result?.[0]?.values || [];

  return rows.map((row: any[]) => ({
    userId: String(row[0]),
    username: String(row[1]),
    role: (String(row[2]) as 'owner' | 'editor' | 'viewer') || 'viewer',
    addedAt: String(row[3]),
  }));
}

export async function createCollabConversation(
  input: { projectId: string; title: string; createdByUserId: string },
  env?: Record<string, any>,
): Promise<CollabConversation | null> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return null;
  }

  const hasAccess = await hasCollabProjectAccess(input.projectId, input.createdByUserId, env);

  if (!hasAccess) {
    return null;
  }

  const id = (globalThis as any)?.crypto?.randomUUID?.() || `conversation_${Date.now()}`;
  const createdAt = new Date().toISOString();

  ctx.db.run(
    'INSERT INTO collab_conversations (id, project_id, title, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?);',
    [id, input.projectId, input.title, input.createdByUserId, createdAt],
  );

  const mainBranchId = (globalThis as any)?.crypto?.randomUUID?.() || `branch_main_${Date.now()}`;
  ctx.db.run(
    `
      INSERT INTO collab_branches (id, conversation_id, name, owner_user_id, source_branch_id, is_main, status, merged_into_branch_id, created_at, merged_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    [mainBranchId, id, 'main', input.createdByUserId, null, 1, 'active', null, createdAt, null],
  );

  await save(ctx);

  return {
    id,
    projectId: input.projectId,
    title: input.title,
    createdByUserId: input.createdByUserId,
    createdAt,
  };
}

export async function listCollabConversations(
  projectId: string,
  userId: string,
  env?: Record<string, any>,
): Promise<CollabConversation[]> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return [];
  }

  const hasAccess = await hasCollabProjectAccess(projectId, userId, env);

  if (!hasAccess) {
    return [];
  }

  const result = ctx.db.exec(
    `
      SELECT id, project_id, title, created_by_user_id, created_at
      FROM collab_conversations
      WHERE project_id = ?
      ORDER BY created_at ASC;
    `,
    [projectId],
  );

  const rows = result?.[0]?.values || [];

  return rows.map((row: any[]) => ({
    id: String(row[0]),
    projectId: String(row[1]),
    title: String(row[2]),
    createdByUserId: String(row[3]),
    createdAt: String(row[4]),
  }));
}

async function getConversationProjectId(conversationId: string, env?: Record<string, any>): Promise<string | null> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return null;
  }

  const result = ctx.db.exec('SELECT project_id FROM collab_conversations WHERE id = ? LIMIT 1;', [conversationId]);
  const row = result?.[0]?.values?.[0];

  return row ? String(row[0]) : null;
}

async function getBranchByName(
  conversationId: string,
  name: string,
  env?: Record<string, any>,
): Promise<CollabBranch | null> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return null;
  }

  const result = ctx.db.exec(
    `
      SELECT id, conversation_id, name, owner_user_id, source_branch_id, is_main, status, merged_into_branch_id, created_at, merged_at
      FROM collab_branches
      WHERE conversation_id = ? AND name = ?
      LIMIT 1;
    `,
    [conversationId, name],
  );
  const row = result?.[0]?.values?.[0];

  if (!row) {
    return null;
  }

  return {
    id: String(row[0]),
    conversationId: String(row[1]),
    name: String(row[2]),
    ownerUserId: String(row[3]),
    sourceBranchId: row[4] ? String(row[4]) : null,
    isMain: Number(row[5]) === 1,
    status: (String(row[6]) as 'active' | 'merged') || 'active',
    mergedIntoBranchId: row[7] ? String(row[7]) : null,
    createdAt: String(row[8]),
    mergedAt: row[9] ? String(row[9]) : null,
  };
}

async function getBranchById(branchId: string, env?: Record<string, any>): Promise<CollabBranch | null> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return null;
  }

  const result = ctx.db.exec(
    `
      SELECT id, conversation_id, name, owner_user_id, source_branch_id, is_main, status, merged_into_branch_id, created_at, merged_at
      FROM collab_branches
      WHERE id = ?
      LIMIT 1;
    `,
    [branchId],
  );
  const row = result?.[0]?.values?.[0];

  if (!row) {
    return null;
  }

  return {
    id: String(row[0]),
    conversationId: String(row[1]),
    name: String(row[2]),
    ownerUserId: String(row[3]),
    sourceBranchId: row[4] ? String(row[4]) : null,
    isMain: Number(row[5]) === 1,
    status: (String(row[6]) as 'active' | 'merged') || 'active',
    mergedIntoBranchId: row[7] ? String(row[7]) : null,
    createdAt: String(row[8]),
    mergedAt: row[9] ? String(row[9]) : null,
  };
}

async function getMainBranch(conversationId: string, env?: Record<string, any>): Promise<CollabBranch | null> {
  const branch = await getBranchByName(conversationId, 'main', env);
  return branch;
}

async function getOrCreateUserBranch(
  conversationId: string,
  userId: string,
  env?: Record<string, any>,
): Promise<CollabBranch | null> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return null;
  }

  const branchName = `user-${userId.slice(0, 8)}`;
  const existing = await getBranchByName(conversationId, branchName, env);

  if (existing) {
    return existing;
  }

  const mainBranch = await getMainBranch(conversationId, env);

  if (!mainBranch) {
    return null;
  }

  const id = (globalThis as any)?.crypto?.randomUUID?.() || `branch_${Date.now()}`;
  const createdAt = new Date().toISOString();

  ctx.db.run(
    `
      INSERT INTO collab_branches (id, conversation_id, name, owner_user_id, source_branch_id, is_main, status, merged_into_branch_id, created_at, merged_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(conversation_id, name) DO NOTHING;
    `,
    [id, conversationId, branchName, userId, mainBranch.id, 0, 'active', null, createdAt, null],
  );

  await save(ctx);

  return getBranchByName(conversationId, branchName, env);
}

export async function listCollabBranches(
  conversationId: string,
  userId: string,
  env?: Record<string, any>,
): Promise<CollabBranch[]> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return [];
  }

  const projectId = await getConversationProjectId(conversationId, env);

  if (!projectId) {
    return [];
  }

  const hasAccess = await hasCollabProjectAccess(projectId, userId, env);

  if (!hasAccess) {
    return [];
  }

  await getOrCreateUserBranch(conversationId, userId, env);

  const result = ctx.db.exec(
    `
      SELECT id, conversation_id, name, owner_user_id, source_branch_id, is_main, status, merged_into_branch_id, created_at, merged_at
      FROM collab_branches
      WHERE conversation_id = ?
      ORDER BY is_main DESC, created_at ASC;
    `,
    [conversationId],
  );

  const rows = result?.[0]?.values || [];

  return rows.map((row: any[]) => ({
    id: String(row[0]),
    conversationId: String(row[1]),
    name: String(row[2]),
    ownerUserId: String(row[3]),
    sourceBranchId: row[4] ? String(row[4]) : null,
    isMain: Number(row[5]) === 1,
    status: (String(row[6]) as 'active' | 'merged') || 'active',
    mergedIntoBranchId: row[7] ? String(row[7]) : null,
    createdAt: String(row[8]),
    mergedAt: row[9] ? String(row[9]) : null,
  }));
}

export async function mergeCollabBranchToMain(
  input: { conversationId: string; sourceBranchId: string; userId: string },
  env?: Record<string, any>,
): Promise<{ mergedCount: number } | null> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return null;
  }

  const projectId = await getConversationProjectId(input.conversationId, env);

  if (!projectId) {
    return null;
  }

  const hasAccess = await hasCollabProjectAccess(projectId, input.userId, env);

  if (!hasAccess) {
    return null;
  }

  const sourceBranch = await getBranchById(input.sourceBranchId, env);
  const mainBranch = await getMainBranch(input.conversationId, env);

  if (!sourceBranch || !mainBranch || sourceBranch.conversationId !== input.conversationId || sourceBranch.isMain) {
    return null;
  }

  if (sourceBranch.status === 'merged') {
    return { mergedCount: 0 };
  }

  const rows =
    ctx.db.exec(
      `
      SELECT user_id, role, content, created_at
      FROM collab_branch_messages
      WHERE branch_id = ?
      ORDER BY created_at ASC;
    `,
      [sourceBranch.id],
    )?.[0]?.values || [];

  for (const row of rows) {
    ctx.db.run(
      'INSERT INTO collab_branch_messages (branch_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?);',
      [mainBranch.id, String(row[0]), String(row[1]), String(row[2]), new Date().toISOString()],
    );
  }

  ctx.db.run('UPDATE collab_branches SET status = ?, merged_into_branch_id = ?, merged_at = ? WHERE id = ?;', [
    'merged',
    mainBranch.id,
    new Date().toISOString(),
    sourceBranch.id,
  ]);

  await save(ctx);

  return { mergedCount: rows.length };
}

export async function appendCollabMessage(
  input: {
    conversationId: string;
    userId: string;
    role: string;
    content: string;
    branchId?: string;
    useMainBranch?: boolean;
  },
  env?: Record<string, any>,
): Promise<boolean> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return false;
  }

  const projectId = await getConversationProjectId(input.conversationId, env);

  if (!projectId) {
    return false;
  }

  const hasAccess = await hasCollabProjectAccess(projectId, input.userId, env);

  if (!hasAccess) {
    return false;
  }

  let targetBranch: CollabBranch | null = null;

  if (input.branchId) {
    targetBranch = await getBranchById(input.branchId, env);
  } else if (input.useMainBranch) {
    targetBranch = await getMainBranch(input.conversationId, env);
  } else {
    targetBranch = await getOrCreateUserBranch(input.conversationId, input.userId, env);
  }

  if (!targetBranch || targetBranch.conversationId !== input.conversationId) {
    return false;
  }

  if (targetBranch.status !== 'active') {
    return false;
  }

  ctx.db.run(
    'INSERT INTO collab_branch_messages (branch_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?);',
    [targetBranch.id, input.userId, input.role, input.content, new Date().toISOString()],
  );

  await save(ctx);

  return true;
}

export async function listCollabMessages(
  conversationId: string,
  userId: string,
  env?: Record<string, any>,
  limit: number = 200,
  options?: { branchId?: string; branchMode?: 'main' | 'user' },
): Promise<CollabMessage[]> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return [];
  }

  const projectId = await getConversationProjectId(conversationId, env);

  if (!projectId) {
    return [];
  }

  const hasAccess = await hasCollabProjectAccess(projectId, userId, env);

  if (!hasAccess) {
    return [];
  }

  let targetBranch: CollabBranch | null = null;

  if (options?.branchId) {
    targetBranch = await getBranchById(options.branchId, env);
  } else if (options?.branchMode === 'main') {
    targetBranch = await getMainBranch(conversationId, env);
  } else {
    targetBranch = await getOrCreateUserBranch(conversationId, userId, env);
  }

  if (!targetBranch || targetBranch.conversationId !== conversationId) {
    return [];
  }

  const safeLimit = Math.max(1, Math.min(1000, limit));
  const result = ctx.db.exec(
    `
      SELECT m.id, b.conversation_id, m.user_id, u.username, m.role, m.content, m.created_at
      FROM collab_branch_messages m
      JOIN collab_branches b ON b.id = m.branch_id
      JOIN users u ON u.id = m.user_id
      WHERE m.branch_id = ?
      ORDER BY m.created_at ASC
      LIMIT ?;
    `,
    [targetBranch.id, safeLimit],
  );

  const rows = result?.[0]?.values || [];

  return rows.map((row: any[]) => ({
    id: Number(row[0]),
    conversationId: String(row[1]),
    userId: String(row[2]),
    username: String(row[3]),
    role: String(row[4]),
    content: String(row[5]),
    createdAt: String(row[6]),
  }));
}

export async function upsertAgentRunRecord(
  input: {
    runId: string;
    state: string;
    payload: Record<string, any>;
    createdAt: string;
    updatedAt?: string;
  },
  env?: Record<string, any>,
): Promise<AgentRunPersistedRecord | null> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return null;
  }

  const updatedAt = input.updatedAt || new Date().toISOString();

  ctx.db.run(
    `
      INSERT INTO agent_runs (run_id, state, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(run_id) DO UPDATE SET
        state = excluded.state,
        payload = excluded.payload,
        updated_at = excluded.updated_at;
    `,
    [input.runId, input.state, JSON.stringify(input.payload || {}), input.createdAt, updatedAt],
  );

  await save(ctx);

  return {
    runId: input.runId,
    state: input.state,
    payload: input.payload,
    createdAt: input.createdAt,
    updatedAt,
  };
}

export async function readAgentRunRecord(
  runId: string,
  env?: Record<string, any>,
): Promise<AgentRunPersistedRecord | null> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return null;
  }

  const result = ctx.db.exec(
    `
      SELECT run_id, state, payload, created_at, updated_at
      FROM agent_runs
      WHERE run_id = ?
      LIMIT 1;
    `,
    [runId],
  );

  const row = result?.[0]?.values?.[0];

  if (!row) {
    return null;
  }

  return {
    runId: String(row[0]),
    state: String(row[1]),
    payload: parseJsonRecord(row[2]),
    createdAt: String(row[3]),
    updatedAt: String(row[4]),
  };
}

export async function listAgentRunRecords(limit = 50, env?: Record<string, any>): Promise<AgentRunPersistedRecord[]> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return [];
  }

  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 50;

  const result = ctx.db.exec(
    `
      SELECT run_id, state, payload, created_at, updated_at
      FROM agent_runs
      ORDER BY updated_at DESC
      LIMIT ?;
    `,
    [safeLimit],
  );

  const rows = result?.[0]?.values || [];

  return rows.map((row: any[]) => ({
    runId: String(row[0]),
    state: String(row[1]),
    payload: parseJsonRecord(row[2]),
    createdAt: String(row[3]),
    updatedAt: String(row[4]),
  }));
}

// Artifact CRUD operations

async function hasArtifactAccess(artifactId: string, userId: string, env?: Record<string, any>): Promise<boolean> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return false;
  }

  const result = ctx.db.exec(
    `
      SELECT a.id, a.owner_user_id, a.project_id, a.visibility
      FROM collab_artifacts a
      WHERE a.id = ?
      LIMIT 1;
    `,
    [artifactId],
  );

  const row = result?.[0]?.values?.[0];

  if (!row) {
    return false;
  }

  const ownerUserId = String(row[1]);
  const projectId = row[2] ? String(row[2]) : null;
  const visibility = String(row[3]);

  // Owner always has access
  if (ownerUserId === userId) {
    return true;
  }

  // Public artifacts are readable by anyone
  if (visibility === 'public') {
    return true;
  }

  // Project artifacts require project membership
  if (visibility === 'project' && projectId) {
    return hasCollabProjectAccess(projectId, userId, env);
  }

  // Private artifacts only accessible by owner
  return false;
}

export async function createArtifact(
  input: {
    ownerUserId: string;
    projectId?: string | null;
    name: string;
    description?: string | null;
    artifactType: 'module' | 'component' | 'snippet' | 'asset';
    visibility?: 'private' | 'project' | 'public';
    content: string;
    metadata?: Record<string, any> | null;
  },
  env?: Record<string, any>,
): Promise<CollabArtifact | null> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return null;
  }

  // If project-scoped, verify user has access to the project
  if (input.projectId) {
    const hasAccess = await hasCollabProjectAccess(input.projectId, input.ownerUserId, env);

    if (!hasAccess) {
      return null;
    }
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const updatedAt = createdAt;
  const visibility = input.visibility || 'private';

  ctx.db.run(
    `
      INSERT INTO collab_artifacts (
        id, project_id, owner_user_id, name, description, 
        artifact_type, visibility, content, metadata, 
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    [
      id,
      input.projectId || null,
      input.ownerUserId,
      input.name,
      input.description || null,
      input.artifactType,
      visibility,
      input.content,
      input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt,
      updatedAt,
    ],
  );

  await save(ctx);

  return {
    id,
    projectId: input.projectId || null,
    ownerUserId: input.ownerUserId,
    name: input.name,
    description: input.description || null,
    artifactType: input.artifactType,
    visibility,
    content: input.content,
    metadata: input.metadata || null,
    createdAt,
    updatedAt,
  };
}

export async function listArtifactsByProject(
  projectId: string,
  userId: string,
  env?: Record<string, any>,
): Promise<CollabArtifact[]> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return [];
  }

  // Verify user has access to the project
  const hasAccess = await hasCollabProjectAccess(projectId, userId, env);

  if (!hasAccess) {
    return [];
  }

  const result = ctx.db.exec(
    `
      SELECT 
        id, project_id, owner_user_id, name, description, 
        artifact_type, visibility, content, metadata, 
        created_at, updated_at
      FROM collab_artifacts
      WHERE project_id = ?
      ORDER BY updated_at DESC;
    `,
    [projectId],
  );

  const rows = result?.[0]?.values || [];

  return rows.map((row: any[]) => ({
    id: String(row[0]),
    projectId: row[1] ? String(row[1]) : null,
    ownerUserId: String(row[2]),
    name: String(row[3]),
    description: row[4] ? String(row[4]) : null,
    artifactType: String(row[5]) as 'module' | 'component' | 'snippet' | 'asset',
    visibility: String(row[6]) as 'private' | 'project' | 'public',
    content: String(row[7]),
    metadata: row[8] ? parseJsonRecord(row[8]) : null,
    createdAt: String(row[9]),
    updatedAt: String(row[10]),
  }));
}

export async function listArtifactsByUser(userId: string, env?: Record<string, any>): Promise<CollabArtifact[]> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return [];
  }

  const result = ctx.db.exec(
    `
      SELECT 
        id, project_id, owner_user_id, name, description, 
        artifact_type, visibility, content, metadata, 
        created_at, updated_at
      FROM collab_artifacts
      WHERE owner_user_id = ?
      ORDER BY updated_at DESC;
    `,
    [userId],
  );

  const rows = result?.[0]?.values || [];

  return rows.map((row: any[]) => ({
    id: String(row[0]),
    projectId: row[1] ? String(row[1]) : null,
    ownerUserId: String(row[2]),
    name: String(row[3]),
    description: row[4] ? String(row[4]) : null,
    artifactType: String(row[5]) as 'module' | 'component' | 'snippet' | 'asset',
    visibility: String(row[6]) as 'private' | 'project' | 'public',
    content: String(row[7]),
    metadata: row[8] ? parseJsonRecord(row[8]) : null,
    createdAt: String(row[9]),
    updatedAt: String(row[10]),
  }));
}

export async function getArtifact(
  artifactId: string,
  userId: string,
  env?: Record<string, any>,
): Promise<CollabArtifact | null> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return null;
  }

  // Check access first
  const hasAccess = await hasArtifactAccess(artifactId, userId, env);

  if (!hasAccess) {
    return null;
  }

  const result = ctx.db.exec(
    `
      SELECT 
        id, project_id, owner_user_id, name, description, 
        artifact_type, visibility, content, metadata, 
        created_at, updated_at
      FROM collab_artifacts
      WHERE id = ?
      LIMIT 1;
    `,
    [artifactId],
  );

  const row = result?.[0]?.values?.[0];

  if (!row) {
    return null;
  }

  return {
    id: String(row[0]),
    projectId: row[1] ? String(row[1]) : null,
    ownerUserId: String(row[2]),
    name: String(row[3]),
    description: row[4] ? String(row[4]) : null,
    artifactType: String(row[5]) as 'module' | 'component' | 'snippet' | 'asset',
    visibility: String(row[6]) as 'private' | 'project' | 'public',
    content: String(row[7]),
    metadata: row[8] ? parseJsonRecord(row[8]) : null,
    createdAt: String(row[9]),
    updatedAt: String(row[10]),
  };
}

export async function updateArtifact(
  artifactId: string,
  input: {
    userId: string;
    name?: string;
    description?: string | null;
    artifactType?: 'module' | 'component' | 'snippet' | 'asset';
    visibility?: 'private' | 'project' | 'public';
    content?: string;
    metadata?: Record<string, any> | null;
  },
  env?: Record<string, any>,
): Promise<CollabArtifact | null> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return null;
  }

  // Verify ownership
  const existing = await getArtifact(artifactId, input.userId, env);

  if (!existing || existing.ownerUserId !== input.userId) {
    return null;
  }

  const updatedAt = new Date().toISOString();

  // Build update query dynamically based on provided fields
  const updates: string[] = [];
  const params: any[] = [];

  if (input.name !== undefined) {
    updates.push('name = ?');
    params.push(input.name);
  }

  if (input.description !== undefined) {
    updates.push('description = ?');
    params.push(input.description);
  }

  if (input.artifactType !== undefined) {
    updates.push('artifact_type = ?');
    params.push(input.artifactType);
  }

  if (input.visibility !== undefined) {
    updates.push('visibility = ?');
    params.push(input.visibility);
  }

  if (input.content !== undefined) {
    updates.push('content = ?');
    params.push(input.content);
  }

  if (input.metadata !== undefined) {
    updates.push('metadata = ?');
    params.push(input.metadata ? JSON.stringify(input.metadata) : null);
  }

  updates.push('updated_at = ?');
  params.push(updatedAt);
  params.push(artifactId);

  if (updates.length === 1) {
    // Only updated_at, no actual changes
    return existing;
  }

  ctx.db.run(
    `
      UPDATE collab_artifacts
      SET ${updates.join(', ')}
      WHERE id = ?;
    `,
    params,
  );

  await save(ctx);

  return getArtifact(artifactId, input.userId, env);
}

export async function deleteArtifact(artifactId: string, userId: string, env?: Record<string, any>): Promise<boolean> {
  const ctx = await ensureContext(env);

  if (!ctx) {
    return false;
  }

  // Verify ownership
  const existing = await getArtifact(artifactId, userId, env);

  if (!existing || existing.ownerUserId !== userId) {
    return false;
  }

  ctx.db.run(
    `
      DELETE FROM collab_artifacts
      WHERE id = ?;
    `,
    [artifactId],
  );

  await save(ctx);

  return true;
}

export function isSqlitePersistenceEnabled(env?: Record<string, any>): boolean {
  return isEnabled(env);
}
