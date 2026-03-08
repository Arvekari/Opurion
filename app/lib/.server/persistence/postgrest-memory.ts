import { createScopedLogger } from '~/utils/logger';

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

const logger = createScopedLogger('postgrest-memory');

function getEnvValue(env: Record<string, any> | undefined, key: string): string | undefined {
  const processEnv = (globalThis as any)?.process?.env;
  return env?.[key] ?? processEnv?.[key];
}

function getConfig(env?: Record<string, any>) {
  const url = getEnvValue(env, 'POSTGREST_URL') || '';
  const serviceRoleKey = getEnvValue(env, 'POSTGREST_SERVICE_ROLE_KEY') || '';

  return {
    url: url.replace(/\/$/, ''),
    serviceRoleKey,
  };
}

export function isPostgrestEnabled(env?: Record<string, any>): boolean {
  const provider = (getEnvValue(env, 'BOLT_SERVER_DB_PROVIDER') || 'sqlite').toLowerCase();

  if (provider !== 'postgrest') {
    return false;
  }

  const config = getConfig(env);

  return !!config.url;
}

async function requestPostgrest<T>(
  path: string,
  init: RequestInit,
  env?: Record<string, any>,
): Promise<{ ok: boolean; data: T | null; status: number; headers: Headers }> {
  const config = getConfig(env);

  if (!config.url) {
    return { ok: false, data: null, status: 500, headers: new Headers() };
  }

  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json');

  if (config.serviceRoleKey) {
    headers.set('Authorization', `Bearer ${config.serviceRoleKey}`);
    headers.set('apikey', config.serviceRoleKey);
  }

  let response: Response;

  try {
    response = await fetch(`${config.url}${path}`, {
      ...init,
      headers,
    });
  } catch (error) {
    logger.warn('PostgREST request failed', {
      path,
      method: init.method || 'GET',
      error: error instanceof Error ? error.message : String(error),
    });

    return { ok: false, data: null, status: 503, headers: new Headers() };
  }

  let data: T | null = null;

  if (response.status !== 204) {
    try {
      data = (await response.json()) as T;
    } catch {
      data = null;
    }
  }

  return { ok: response.ok, data, status: response.status, headers: response.headers };
}

function asRecord(value: unknown): Record<string, any> {
  if (!value) {
    return {};
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  return typeof value === 'object' ? (value as Record<string, any>) : {};
}

function asEmbedding(value: unknown): number[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((x) => (typeof x === 'number' ? x : 0));
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((x) => (typeof x === 'number' ? x : 0)) : [];
    } catch {
      return [];
    }
  }

  return [];
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

const DEFAULT_MEMORY: PersistedMemory = {
  apiKeys: {},
  providerSettings: {},
  customPrompt: { enabled: false, instructions: '' },
  dbConfig: { provider: 'sqlite', postgresUrl: '' },
};

export async function readPersistedMemory(env?: Record<string, any>): Promise<PersistedMemory | null> {
  if (!isPostgrestEnabled(env)) {
    return null;
  }

  const result = await requestPostgrest<any[]>(
    '/app_memory?id=eq.1&select=api_keys,provider_settings,custom_prompt,db_config&limit=1',
    { method: 'GET' },
    env,
  );

  if (!result.ok || !result.data?.[0]) {
    return DEFAULT_MEMORY;
  }

  const row = result.data[0];
  const customPrompt = asRecord(row.custom_prompt);
  const dbConfig = asRecord(row.db_config);

  return {
    apiKeys: asRecord(row.api_keys) as Record<string, string>,
    providerSettings: asRecord(row.provider_settings),
    customPrompt: {
      enabled: !!customPrompt.enabled,
      instructions: typeof customPrompt.instructions === 'string' ? customPrompt.instructions : '',
    },
    dbConfig: {
      provider: dbConfig.provider === 'postgres' ? 'postgres' : 'sqlite',
      postgresUrl: typeof dbConfig.postgresUrl === 'string' ? dbConfig.postgresUrl : '',
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
  if (!isPostgrestEnabled(env)) {
    return false;
  }

  const current = (await readPersistedMemory(env)) || DEFAULT_MEMORY;

  const body = {
    id: 1,
    api_keys: input.apiKeys ? { ...current.apiKeys, ...input.apiKeys } : current.apiKeys,
    provider_settings: input.providerSettings
      ? { ...current.providerSettings, ...input.providerSettings }
      : current.providerSettings,
    custom_prompt: input.customPrompt
      ? {
          enabled: input.customPrompt.enabled ?? current.customPrompt.enabled,
          instructions:
            typeof input.customPrompt.instructions === 'string'
              ? input.customPrompt.instructions
              : current.customPrompt.instructions,
        }
      : current.customPrompt,
    db_config: input.dbConfig
      ? {
          provider: input.dbConfig.provider === 'postgres' ? 'postgres' : 'sqlite',
          postgresUrl: typeof input.dbConfig.postgresUrl === 'string' ? input.dbConfig.postgresUrl : '',
        }
      : current.dbConfig,
    updated_at: new Date().toISOString(),
  };

  const response = await requestPostgrest<any[]>(
    '/app_memory?on_conflict=id',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(body),
    },
    env,
  );

  return response.ok;
}

export async function getUserCount(env?: Record<string, any>): Promise<number> {
  if (!isPostgrestEnabled(env)) {
    return 0;
  }

  const response = await requestPostgrest<any[]>('/users?select=id', { method: 'GET' }, env);

  if (!response.ok || !response.data) {
    return 0;
  }

  return response.data.length;
}

export async function createUser(
  input: { username: string; passwordHash: string; passwordSalt: string; isAdmin?: boolean },
  env?: Record<string, any>,
): Promise<{ id: string; username: string; isAdmin: boolean } | null> {
  if (!isPostgrestEnabled(env)) {
    return null;
  }

  const id = (globalThis as any)?.crypto?.randomUUID?.() || `user_${Date.now()}`;

  const response = await requestPostgrest<any[]>(
    '/users',
    {
      method: 'POST',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        id,
        username: input.username,
        password_hash: input.passwordHash,
        password_salt: input.passwordSalt,
        is_admin: !!input.isAdmin,
        created_at: new Date().toISOString(),
      }),
    },
    env,
  );

  const row = response.data?.[0];

  if (!response.ok || !row) {
    logger.warn('Failed to create user in PostgREST backend', { status: response.status });
    return null;
  }

  return {
    id: String(row.id),
    username: String(row.username),
    isAdmin: !!row.is_admin,
  };
}

export async function findUserByUsername(
  username: string,
  env?: Record<string, any>,
): Promise<{
  id: string;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  isAdmin: boolean;
} | null> {
  if (!isPostgrestEnabled(env)) {
    return null;
  }

  const response = await requestPostgrest<any[]>(
    `/users?username=eq.${encodeURIComponent(username)}&select=id,username,password_hash,password_salt,is_admin&limit=1`,
    { method: 'GET' },
    env,
  );

  const row = response.data?.[0];

  if (!response.ok || !row) {
    return null;
  }

  return {
    id: String(row.id),
    username: String(row.username),
    passwordHash: String(row.password_hash),
    passwordSalt: String(row.password_salt),
    isAdmin: !!row.is_admin,
  };
}

export async function createSession(
  userId: string,
  env?: Record<string, any>,
  ttlHours: number = 24 * 14,
): Promise<{ token: string; expiresAt: string } | null> {
  if (!isPostgrestEnabled(env)) {
    return null;
  }

  const token = (globalThis as any)?.crypto?.randomUUID?.() || `sess_${Date.now()}`;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + ttlHours * 60 * 60 * 1000).toISOString();

  const response = await requestPostgrest<any[]>(
    '/sessions',
    {
      method: 'POST',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        token,
        user_id: userId,
        expires_at: expiresAt,
        created_at: createdAt.toISOString(),
      }),
    },
    env,
  );

  if (!response.ok) {
    return null;
  }

  return { token, expiresAt };
}

export async function getSessionUser(
  token: string,
  env?: Record<string, any>,
): Promise<{ userId: string; username: string; isAdmin: boolean; expiresAt: string } | null> {
  if (!isPostgrestEnabled(env)) {
    return null;
  }

  const response = await requestPostgrest<any[]>(
    `/sessions?token=eq.${encodeURIComponent(token)}&select=user_id,expires_at,users(username,is_admin)&limit=1`,
    { method: 'GET' },
    env,
  );

  const row = response.data?.[0];

  if (!response.ok || !row) {
    return null;
  }

  const expiresAt = String(row.expires_at || '');

  if (!expiresAt || new Date(expiresAt).getTime() < Date.now()) {
    await deleteSession(token, env);
    return null;
  }

  const user = row.users || {};

  return {
    userId: String(row.user_id),
    username: String(user.username || ''),
    isAdmin: !!user.is_admin,
    expiresAt,
  };
}

export async function deleteSession(token: string, env?: Record<string, any>): Promise<void> {
  if (!isPostgrestEnabled(env)) {
    return;
  }

  await requestPostgrest(`/sessions?token=eq.${encodeURIComponent(token)}`, { method: 'DELETE' }, env);
}

export async function readPersistedMemoryForUser(
  userId: string,
  env?: Record<string, any>,
): Promise<PersistedMemory | null> {
  if (!isPostgrestEnabled(env)) {
    return null;
  }

  const response = await requestPostgrest<any[]>(
    `/user_memory?user_id=eq.${encodeURIComponent(userId)}&select=api_keys,provider_settings,custom_prompt,db_config&limit=1`,
    { method: 'GET' },
    env,
  );

  if (!response.ok || !response.data?.[0]) {
    return DEFAULT_MEMORY;
  }

  const row = response.data[0];
  const customPrompt = asRecord(row.custom_prompt);
  const dbConfig = asRecord(row.db_config);

  return {
    apiKeys: asRecord(row.api_keys) as Record<string, string>,
    providerSettings: asRecord(row.provider_settings),
    customPrompt: {
      enabled: !!customPrompt.enabled,
      instructions: typeof customPrompt.instructions === 'string' ? customPrompt.instructions : '',
    },
    dbConfig: {
      provider: dbConfig.provider === 'postgres' ? 'postgres' : 'sqlite',
      postgresUrl: typeof dbConfig.postgresUrl === 'string' ? dbConfig.postgresUrl : '',
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
  if (!isPostgrestEnabled(env)) {
    return false;
  }

  const current = (await readPersistedMemoryForUser(userId, env)) || DEFAULT_MEMORY;

  const body = {
    user_id: userId,
    api_keys: input.apiKeys ? { ...current.apiKeys, ...input.apiKeys } : current.apiKeys,
    provider_settings: input.providerSettings
      ? { ...current.providerSettings, ...input.providerSettings }
      : current.providerSettings,
    custom_prompt: input.customPrompt
      ? {
          enabled: input.customPrompt.enabled ?? current.customPrompt.enabled,
          instructions:
            typeof input.customPrompt.instructions === 'string'
              ? input.customPrompt.instructions
              : current.customPrompt.instructions,
        }
      : current.customPrompt,
    db_config: input.dbConfig
      ? {
          provider: input.dbConfig.provider === 'postgres' ? 'postgres' : 'sqlite',
          postgresUrl: typeof input.dbConfig.postgresUrl === 'string' ? input.dbConfig.postgresUrl : '',
        }
      : current.dbConfig,
    updated_at: new Date().toISOString(),
  };

  const response = await requestPostgrest<any[]>(
    '/user_memory?on_conflict=user_id',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(body),
    },
    env,
  );

  return response.ok;
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
  if (!isPostgrestEnabled(env)) {
    return;
  }

  await requestPostgrest(
    '/user_vectors',
    {
      method: 'POST',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: input.userId,
        namespace: input.namespace,
        source_id: input.sourceId,
        content: input.content,
        metadata: input.metadata || {},
        embedding: input.embedding || [],
        created_at: new Date().toISOString(),
      }),
    },
    env,
  );
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
  if (!isPostgrestEnabled(env)) {
    return [];
  }

  const response = await requestPostgrest<any[]>(
    `/user_vectors?user_id=eq.${encodeURIComponent(input.userId)}&namespace=eq.${encodeURIComponent(input.namespace)}&select=id,user_id,namespace,source_id,content,metadata,embedding,created_at`,
    { method: 'GET' },
    env,
  );

  if (!response.ok || !response.data) {
    return [];
  }

  const vectors = response.data.map((row) => {
    const embedding = asEmbedding(row.embedding);

    return {
      id: Number(row.id),
      userId: String(row.user_id),
      namespace: String(row.namespace),
      sourceId: String(row.source_id),
      content: String(row.content),
      metadata: asRecord(row.metadata),
      embedding,
      createdAt: String(row.created_at),
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

async function hasCollabProjectAccess(projectId: string, userId: string, env?: Record<string, any>): Promise<boolean> {
  const response = await requestPostgrest<any[]>(
    `/collab_project_members?project_id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(userId)}&select=role&limit=1`,
    { method: 'GET' },
    env,
  );

  return !!response.ok && !!response.data?.[0];
}

export async function createCollabProject(
  input: { ownerUserId: string; name: string },
  env?: Record<string, any>,
): Promise<CollabProject | null> {
  if (!isPostgrestEnabled(env)) {
    return null;
  }

  const id = (globalThis as any)?.crypto?.randomUUID?.() || `project_${Date.now()}`;
  const createdAt = new Date().toISOString();

  const projectResp = await requestPostgrest<any[]>(
    '/collab_projects',
    {
      method: 'POST',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        id,
        name: input.name,
        owner_user_id: input.ownerUserId,
        created_at: createdAt,
      }),
    },
    env,
  );

  if (!projectResp.ok) {
    return null;
  }

  const memberResp = await requestPostgrest<any[]>(
    '/collab_project_members?on_conflict=project_id,user_id',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        project_id: id,
        user_id: input.ownerUserId,
        role: 'owner',
        invited_by_user_id: input.ownerUserId,
        created_at: createdAt,
      }),
    },
    env,
  );

  if (!memberResp.ok) {
    return null;
  }

  return {
    id,
    name: input.name,
    ownerUserId: input.ownerUserId,
    role: 'owner',
    createdAt,
  };
}

export async function listCollabProjectsForUser(userId: string, env?: Record<string, any>): Promise<CollabProject[]> {
  if (!isPostgrestEnabled(env)) {
    return [];
  }

  const response = await requestPostgrest<any[]>(
    `/collab_project_members?user_id=eq.${encodeURIComponent(userId)}&select=role,collab_projects(id,name,owner_user_id,created_at)&order=created_at.desc`,
    { method: 'GET' },
    env,
  );

  if (!response.ok || !response.data) {
    return [];
  }

  return response.data
    .map((row) => {
      const project = row.collab_projects || {};

      if (!project.id) {
        return null;
      }

      return {
        id: String(project.id),
        name: String(project.name || ''),
        ownerUserId: String(project.owner_user_id || ''),
        createdAt: String(project.created_at || ''),
        role: (String(row.role || 'viewer') as 'owner' | 'editor' | 'viewer') || 'viewer',
      } satisfies CollabProject;
    })
    .filter((item): item is CollabProject => !!item);
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
  if (!isPostgrestEnabled(env)) {
    return false;
  }

  const hasAccess = await hasCollabProjectAccess(input.projectId, input.invitedByUserId, env);

  if (!hasAccess) {
    return false;
  }

  const response = await requestPostgrest<any[]>(
    '/collab_project_members?on_conflict=project_id,user_id',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        project_id: input.projectId,
        user_id: input.targetUserId,
        role: input.role || 'editor',
        invited_by_user_id: input.invitedByUserId,
        created_at: new Date().toISOString(),
      }),
    },
    env,
  );

  return response.ok;
}

export async function listCollabProjectMembers(
  projectId: string,
  requesterUserId: string,
  env?: Record<string, any>,
): Promise<CollabProjectMember[]> {
  if (!isPostgrestEnabled(env)) {
    return [];
  }

  const hasAccess = await hasCollabProjectAccess(projectId, requesterUserId, env);

  if (!hasAccess) {
    return [];
  }

  const response = await requestPostgrest<any[]>(
    `/collab_project_members?project_id=eq.${encodeURIComponent(projectId)}&select=user_id,role,created_at,users(username)&order=created_at.asc`,
    { method: 'GET' },
    env,
  );

  if (!response.ok || !response.data) {
    return [];
  }

  return response.data.map((row) => ({
    userId: String(row.user_id),
    username: String(row.users?.username || ''),
    role: (String(row.role || 'viewer') as 'owner' | 'editor' | 'viewer') || 'viewer',
    addedAt: String(row.created_at || ''),
  }));
}

export async function createCollabConversation(
  input: { projectId: string; title: string; createdByUserId: string },
  env?: Record<string, any>,
): Promise<CollabConversation | null> {
  if (!isPostgrestEnabled(env)) {
    return null;
  }

  const hasAccess = await hasCollabProjectAccess(input.projectId, input.createdByUserId, env);

  if (!hasAccess) {
    return null;
  }

  const id = (globalThis as any)?.crypto?.randomUUID?.() || `conversation_${Date.now()}`;
  const createdAt = new Date().toISOString();

  const response = await requestPostgrest<any[]>(
    '/collab_conversations',
    {
      method: 'POST',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        id,
        project_id: input.projectId,
        title: input.title,
        created_by_user_id: input.createdByUserId,
        created_at: createdAt,
      }),
    },
    env,
  );

  const row = response.data?.[0];

  if (!response.ok || !row) {
    return null;
  }

  await requestPostgrest<any[]>(
    '/collab_branches?on_conflict=conversation_id,name',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        id: (globalThis as any)?.crypto?.randomUUID?.() || `branch_main_${Date.now()}`,
        conversation_id: String(row.id),
        name: 'main',
        owner_user_id: input.createdByUserId,
        source_branch_id: null,
        is_main: true,
        status: 'active',
        merged_into_branch_id: null,
        created_at: new Date().toISOString(),
        merged_at: null,
      }),
    },
    env,
  );

  return {
    id: String(row.id),
    projectId: String(row.project_id),
    title: String(row.title),
    createdByUserId: String(row.created_by_user_id),
    createdAt: String(row.created_at),
  };
}

export async function listCollabConversations(
  projectId: string,
  userId: string,
  env?: Record<string, any>,
): Promise<CollabConversation[]> {
  if (!isPostgrestEnabled(env)) {
    return [];
  }

  const hasAccess = await hasCollabProjectAccess(projectId, userId, env);

  if (!hasAccess) {
    return [];
  }

  const response = await requestPostgrest<any[]>(
    `/collab_conversations?project_id=eq.${encodeURIComponent(projectId)}&select=id,project_id,title,created_by_user_id,created_at&order=created_at.asc`,
    { method: 'GET' },
    env,
  );

  if (!response.ok || !response.data) {
    return [];
  }

  return response.data.map((row) => ({
    id: String(row.id),
    projectId: String(row.project_id),
    title: String(row.title),
    createdByUserId: String(row.created_by_user_id),
    createdAt: String(row.created_at),
  }));
}

async function getConversationProjectId(conversationId: string, env?: Record<string, any>): Promise<string | null> {
  const response = await requestPostgrest<any[]>(
    `/collab_conversations?id=eq.${encodeURIComponent(conversationId)}&select=project_id&limit=1`,
    { method: 'GET' },
    env,
  );

  const row = response.data?.[0];

  return row?.project_id ? String(row.project_id) : null;
}

async function getBranchByName(
  conversationId: string,
  name: string,
  env?: Record<string, any>,
): Promise<CollabBranch | null> {
  const response = await requestPostgrest<any[]>(
    `/collab_branches?conversation_id=eq.${encodeURIComponent(conversationId)}&name=eq.${encodeURIComponent(name)}&select=id,conversation_id,name,owner_user_id,source_branch_id,is_main,status,merged_into_branch_id,created_at,merged_at&limit=1`,
    { method: 'GET' },
    env,
  );

  const row = response.data?.[0];

  if (!response.ok || !row) {
    return null;
  }

  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    name: String(row.name),
    ownerUserId: String(row.owner_user_id),
    sourceBranchId: row.source_branch_id ? String(row.source_branch_id) : null,
    isMain: !!row.is_main,
    status: (String(row.status || 'active') as 'active' | 'merged') || 'active',
    mergedIntoBranchId: row.merged_into_branch_id ? String(row.merged_into_branch_id) : null,
    createdAt: String(row.created_at || ''),
    mergedAt: row.merged_at ? String(row.merged_at) : null,
  };
}

async function getBranchById(branchId: string, env?: Record<string, any>): Promise<CollabBranch | null> {
  const response = await requestPostgrest<any[]>(
    `/collab_branches?id=eq.${encodeURIComponent(branchId)}&select=id,conversation_id,name,owner_user_id,source_branch_id,is_main,status,merged_into_branch_id,created_at,merged_at&limit=1`,
    { method: 'GET' },
    env,
  );

  const row = response.data?.[0];

  if (!response.ok || !row) {
    return null;
  }

  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    name: String(row.name),
    ownerUserId: String(row.owner_user_id),
    sourceBranchId: row.source_branch_id ? String(row.source_branch_id) : null,
    isMain: !!row.is_main,
    status: (String(row.status || 'active') as 'active' | 'merged') || 'active',
    mergedIntoBranchId: row.merged_into_branch_id ? String(row.merged_into_branch_id) : null,
    createdAt: String(row.created_at || ''),
    mergedAt: row.merged_at ? String(row.merged_at) : null,
  };
}

async function getMainBranch(conversationId: string, env?: Record<string, any>): Promise<CollabBranch | null> {
  return getBranchByName(conversationId, 'main', env);
}

async function getOrCreateUserBranch(conversationId: string, userId: string, env?: Record<string, any>) {
  const branchName = `user-${userId.slice(0, 8)}`;
  const existing = await getBranchByName(conversationId, branchName, env);

  if (existing) {
    return existing;
  }

  const mainBranch = await getMainBranch(conversationId, env);

  if (!mainBranch) {
    return null;
  }

  await requestPostgrest<any[]>(
    '/collab_branches?on_conflict=conversation_id,name',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        id: (globalThis as any)?.crypto?.randomUUID?.() || `branch_${Date.now()}`,
        conversation_id: conversationId,
        name: branchName,
        owner_user_id: userId,
        source_branch_id: mainBranch.id,
        is_main: false,
        status: 'active',
        merged_into_branch_id: null,
        created_at: new Date().toISOString(),
        merged_at: null,
      }),
    },
    env,
  );

  return getBranchByName(conversationId, branchName, env);
}

export async function listCollabBranches(
  conversationId: string,
  userId: string,
  env?: Record<string, any>,
): Promise<CollabBranch[]> {
  if (!isPostgrestEnabled(env)) {
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

  const response = await requestPostgrest<any[]>(
    `/collab_branches?conversation_id=eq.${encodeURIComponent(conversationId)}&select=id,conversation_id,name,owner_user_id,source_branch_id,is_main,status,merged_into_branch_id,created_at,merged_at&order=is_main.desc,created_at.asc`,
    { method: 'GET' },
    env,
  );

  if (!response.ok || !response.data) {
    return [];
  }

  return response.data.map((row) => ({
    id: String(row.id),
    conversationId: String(row.conversation_id),
    name: String(row.name),
    ownerUserId: String(row.owner_user_id),
    sourceBranchId: row.source_branch_id ? String(row.source_branch_id) : null,
    isMain: !!row.is_main,
    status: (String(row.status || 'active') as 'active' | 'merged') || 'active',
    mergedIntoBranchId: row.merged_into_branch_id ? String(row.merged_into_branch_id) : null,
    createdAt: String(row.created_at || ''),
    mergedAt: row.merged_at ? String(row.merged_at) : null,
  }));
}

export async function mergeCollabBranchToMain(
  input: { conversationId: string; sourceBranchId: string; userId: string },
  env?: Record<string, any>,
): Promise<{ mergedCount: number } | null> {
  if (!isPostgrestEnabled(env)) {
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

  if (!sourceBranch || !mainBranch || sourceBranch.isMain || sourceBranch.conversationId !== input.conversationId) {
    return null;
  }

  if (sourceBranch.status === 'merged') {
    return { mergedCount: 0 };
  }

  const messagesResp = await requestPostgrest<any[]>(
    `/collab_branch_messages?branch_id=eq.${encodeURIComponent(sourceBranch.id)}&select=user_id,role,content,created_at&order=created_at.asc`,
    { method: 'GET' },
    env,
  );

  const sourceMessages = messagesResp.data || [];

  for (const message of sourceMessages) {
    await requestPostgrest(
      '/collab_branch_messages',
      {
        method: 'POST',
        headers: {
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          branch_id: mainBranch.id,
          user_id: String(message.user_id),
          role: String(message.role || 'user'),
          content: String(message.content || ''),
          created_at: new Date().toISOString(),
        }),
      },
      env,
    );
  }

  await requestPostgrest(
    `/collab_branches?id=eq.${encodeURIComponent(sourceBranch.id)}`,
    {
      method: 'PATCH',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        status: 'merged',
        merged_into_branch_id: mainBranch.id,
        merged_at: new Date().toISOString(),
      }),
    },
    env,
  );

  return { mergedCount: sourceMessages.length };
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
  if (!isPostgrestEnabled(env)) {
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

  if (!targetBranch || targetBranch.conversationId !== input.conversationId || targetBranch.status !== 'active') {
    return false;
  }

  const response = await requestPostgrest<any[]>(
    '/collab_branch_messages',
    {
      method: 'POST',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        branch_id: targetBranch.id,
        user_id: input.userId,
        role: input.role,
        content: input.content,
        created_at: new Date().toISOString(),
      }),
    },
    env,
  );

  return response.ok;
}

export async function listCollabMessages(
  conversationId: string,
  userId: string,
  env?: Record<string, any>,
  limit: number = 200,
  options?: { branchId?: string; branchMode?: 'main' | 'user' },
): Promise<CollabMessage[]> {
  if (!isPostgrestEnabled(env)) {
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
  const response = await requestPostgrest<any[]>(
    `/collab_branch_messages?branch_id=eq.${encodeURIComponent(targetBranch.id)}&select=id,branch_id,user_id,role,content,created_at,users(username),collab_branches(conversation_id)&order=created_at.asc&limit=${safeLimit}`,
    { method: 'GET' },
    env,
  );

  if (!response.ok || !response.data) {
    return [];
  }

  return response.data.map((row) => ({
    id: Number(row.id),
    conversationId: String(row.collab_branches?.conversation_id || conversationId),
    userId: String(row.user_id),
    username: String(row.users?.username || ''),
    role: String(row.role || ''),
    content: String(row.content || ''),
    createdAt: String(row.created_at || ''),
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
  if (!isPostgrestEnabled(env)) {
    return null;
  }

  const updatedAt = input.updatedAt || new Date().toISOString();
  const body = {
    run_id: input.runId,
    state: input.state,
    payload: input.payload || {},
    created_at: input.createdAt,
    updated_at: updatedAt,
  };

  const response = await requestPostgrest<any[]>(
    '/agent_runs?on_conflict=run_id',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(body),
    },
    env,
  );

  if (!response.ok) {
    return null;
  }

  const row = response.data?.[0] || body;

  return {
    runId: String(row.run_id || input.runId),
    state: String(row.state || input.state),
    payload: asRecord(row.payload),
    createdAt: String(row.created_at || input.createdAt),
    updatedAt: String(row.updated_at || updatedAt),
  };
}

export async function readAgentRunRecord(
  runId: string,
  env?: Record<string, any>,
): Promise<AgentRunPersistedRecord | null> {
  if (!isPostgrestEnabled(env)) {
    return null;
  }

  const response = await requestPostgrest<any[]>(
    `/agent_runs?run_id=eq.${encodeURIComponent(runId)}&select=run_id,state,payload,created_at,updated_at&limit=1`,
    { method: 'GET' },
    env,
  );

  const row = response.data?.[0];

  if (!response.ok || !row) {
    return null;
  }

  return {
    runId: String(row.run_id),
    state: String(row.state),
    payload: asRecord(row.payload),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
}

export async function listAgentRunRecords(limit = 50, env?: Record<string, any>): Promise<AgentRunPersistedRecord[]> {
  if (!isPostgrestEnabled(env)) {
    return [];
  }

  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 50;
  const response = await requestPostgrest<any[]>(
    `/agent_runs?select=run_id,state,payload,created_at,updated_at&order=updated_at.desc&limit=${safeLimit}`,
    { method: 'GET' },
    env,
  );

  if (!response.ok || !response.data) {
    return [];
  }

  return response.data.map((row) => ({
    runId: String(row.run_id),
    state: String(row.state),
    payload: asRecord(row.payload),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  }));
}
