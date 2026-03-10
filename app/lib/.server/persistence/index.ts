import * as sqlite from './sqlite-memory';
import * as postgrest from './postgrest-memory';
import { choosePersistenceBackend } from '~/infrastructure/db/router';
import { loadPlatformConfig } from '~/infrastructure/config/loader';

function getEnvValue(env: Record<string, any> | undefined, key: string): string | undefined {
  const processEnv = (globalThis as any)?.process?.env;
  return env?.[key] ?? processEnv?.[key];
}

function getBackendProvider(env?: Record<string, any>): 'sqlite' | 'postgrest' {
  const provider = (getEnvValue(env, 'BOLT_SERVER_DB_PROVIDER') || 'sqlite').toLowerCase();

  if (provider === 'postgrest' || provider === 'postgres') {
    return 'postgrest';
  }

  return 'sqlite';
}

export function getPersistenceRuntimeStatus(env?: Record<string, any>) {
  const config = loadPlatformConfig((env || {}) as Record<string, any>);
  const configuredProvider = getBackendProvider(env);
  const postgrestReachable = postgrest.isPostgrestEnabled(env);

  const selected = choosePersistenceBackend({
    configuredProvider,
    postgrestReachable,
    allowFallbackToSqlite: config.db.allowFallbackToSqlite,
  });

  return {
    configuredProvider,
    activeProvider: selected.active,
    degraded: selected.degraded,
    reason: selected.reason,
  };
}

function usePostgrest(env?: Record<string, any>): boolean {
  return getPersistenceRuntimeStatus(env).activeProvider === 'postgrest';
}

export function isSqlitePersistenceEnabled(env?: Record<string, any>): boolean {
  return !usePostgrest(env) && sqlite.isSqlitePersistenceEnabled(env);
}

export function isPersistenceEnabled(env?: Record<string, any>): boolean {
  return usePostgrest(env) ? postgrest.isPostgrestEnabled(env) : sqlite.isSqlitePersistenceEnabled(env);
}

export async function readPersistedMemory(env?: Record<string, any>) {
  return usePostgrest(env) ? postgrest.readPersistedMemory(env) : sqlite.readPersistedMemory(env);
}

export async function upsertPersistedMemory(
  input: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, any>;
    customPrompt?: { enabled?: boolean; instructions?: string; mode?: 'append' | 'replace' };
    dbConfig?: { provider?: 'sqlite' | 'postgres'; postgresUrl?: string };
  },
  env?: Record<string, any>,
) {
  return usePostgrest(env) ? postgrest.upsertPersistedMemory(input, env) : sqlite.upsertPersistedMemory(input, env);
}

export async function getUserCount(env?: Record<string, any>) {
  return usePostgrest(env) ? postgrest.getUserCount(env) : sqlite.getUserCount(env);
}

export async function createUser(
  input: { username: string; email?: string; passwordHash: string; passwordSalt: string; isAdmin?: boolean },
  env?: Record<string, any>,
) {
  return usePostgrest(env) ? postgrest.createUser(input, env) : sqlite.createUser(input, env);
}

export async function findUserByUsername(username: string, env?: Record<string, any>) {
  return usePostgrest(env) ? postgrest.findUserByUsername(username, env) : sqlite.findUserByUsername(username, env);
}

export async function findUserByEmail(email: string, env?: Record<string, any>) {
  return usePostgrest(env) ? postgrest.findUserByEmail(email, env) : sqlite.findUserByEmail(email, env);
}

export async function createSession(userId: string, env?: Record<string, any>, ttlHours?: number) {
  return usePostgrest(env)
    ? postgrest.createSession(userId, env, ttlHours)
    : sqlite.createSession(userId, env, ttlHours);
}

export async function getSessionUser(token: string, env?: Record<string, any>) {
  return usePostgrest(env) ? postgrest.getSessionUser(token, env) : sqlite.getSessionUser(token, env);
}

export async function deleteSession(token: string, env?: Record<string, any>) {
  return usePostgrest(env) ? postgrest.deleteSession(token, env) : sqlite.deleteSession(token, env);
}

export async function readPersistedMemoryForUser(userId: string, env?: Record<string, any>) {
  return usePostgrest(env)
    ? postgrest.readPersistedMemoryForUser(userId, env)
    : sqlite.readPersistedMemoryForUser(userId, env);
}

export async function upsertPersistedMemoryForUser(
  userId: string,
  input: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, any>;
    customPrompt?: { enabled?: boolean; instructions?: string; mode?: 'append' | 'replace' };
    dbConfig?: { provider?: 'sqlite' | 'postgres'; postgresUrl?: string };
  },
  env?: Record<string, any>,
) {
  return usePostgrest(env)
    ? postgrest.upsertPersistedMemoryForUser(userId, input, env)
    : sqlite.upsertPersistedMemoryForUser(userId, input, env);
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
) {
  return usePostgrest(env) ? postgrest.upsertUserVector(input, env) : sqlite.upsertUserVector(input, env);
}

export async function searchUserVectors(
  input: {
    userId: string;
    namespace: string;
    queryEmbedding: number[];
    limit?: number;
  },
  env?: Record<string, any>,
) {
  return usePostgrest(env) ? postgrest.searchUserVectors(input, env) : sqlite.searchUserVectors(input, env);
}

export async function createCollabProject(input: { ownerUserId: string; name: string }, env?: Record<string, any>) {
  return usePostgrest(env) ? postgrest.createCollabProject(input, env) : sqlite.createCollabProject(input, env);
}

export async function listCollabProjectsForUser(userId: string, env?: Record<string, any>) {
  return usePostgrest(env)
    ? postgrest.listCollabProjectsForUser(userId, env)
    : sqlite.listCollabProjectsForUser(userId, env);
}

export async function addCollabProjectMember(
  input: {
    projectId: string;
    targetUserId: string;
    invitedByUserId: string;
    role?: 'editor' | 'viewer';
  },
  env?: Record<string, any>,
) {
  return usePostgrest(env) ? postgrest.addCollabProjectMember(input, env) : sqlite.addCollabProjectMember(input, env);
}

export async function listCollabProjectMembers(projectId: string, requesterUserId: string, env?: Record<string, any>) {
  return usePostgrest(env)
    ? postgrest.listCollabProjectMembers(projectId, requesterUserId, env)
    : sqlite.listCollabProjectMembers(projectId, requesterUserId, env);
}

export async function createCollabConversation(
  input: { projectId: string; title: string; createdByUserId: string },
  env?: Record<string, any>,
) {
  return usePostgrest(env)
    ? postgrest.createCollabConversation(input, env)
    : sqlite.createCollabConversation(input, env);
}

export async function listCollabConversations(projectId: string, userId: string, env?: Record<string, any>) {
  return usePostgrest(env)
    ? postgrest.listCollabConversations(projectId, userId, env)
    : sqlite.listCollabConversations(projectId, userId, env);
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
) {
  return usePostgrest(env) ? postgrest.appendCollabMessage(input, env) : sqlite.appendCollabMessage(input, env);
}

export async function listCollabMessages(
  conversationId: string,
  userId: string,
  env?: Record<string, any>,
  limit?: number,
  options?: { branchId?: string; branchMode?: 'main' | 'user' },
) {
  return usePostgrest(env)
    ? postgrest.listCollabMessages(conversationId, userId, env, limit, options)
    : sqlite.listCollabMessages(conversationId, userId, env, limit, options);
}

export async function listCollabBranches(conversationId: string, userId: string, env?: Record<string, any>) {
  return usePostgrest(env)
    ? postgrest.listCollabBranches(conversationId, userId, env)
    : sqlite.listCollabBranches(conversationId, userId, env);
}

export async function mergeCollabBranchToMain(
  input: { conversationId: string; sourceBranchId: string; userId: string },
  env?: Record<string, any>,
) {
  return usePostgrest(env) ? postgrest.mergeCollabBranchToMain(input, env) : sqlite.mergeCollabBranchToMain(input, env);
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
) {
  return usePostgrest(env) ? postgrest.upsertAgentRunRecord(input, env) : sqlite.upsertAgentRunRecord(input, env);
}

export async function readAgentRunRecord(runId: string, env?: Record<string, any>) {
  return usePostgrest(env) ? postgrest.readAgentRunRecord(runId, env) : sqlite.readAgentRunRecord(runId, env);
}

export async function listAgentRunRecords(limit = 50, env?: Record<string, any>) {
  return usePostgrest(env) ? postgrest.listAgentRunRecords(limit, env) : sqlite.listAgentRunRecords(limit, env);
}

// Artifact CRUD operations

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
) {
  return usePostgrest(env) ? postgrest.createArtifact(input, env) : sqlite.createArtifact(input, env);
}

export async function listArtifactsByProject(projectId: string, userId: string, env?: Record<string, any>) {
  return usePostgrest(env)
    ? postgrest.listArtifactsByProject(projectId, userId, env)
    : sqlite.listArtifactsByProject(projectId, userId, env);
}

export async function listArtifactsByUser(userId: string, env?: Record<string, any>) {
  return usePostgrest(env) ? postgrest.listArtifactsByUser(userId, env) : sqlite.listArtifactsByUser(userId, env);
}

export async function getArtifact(artifactId: string, userId: string, env?: Record<string, any>) {
  return usePostgrest(env)
    ? postgrest.getArtifact(artifactId, userId, env)
    : sqlite.getArtifact(artifactId, userId, env);
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
) {
  return usePostgrest(env)
    ? postgrest.updateArtifact(artifactId, input, env)
    : sqlite.updateArtifact(artifactId, input, env);
}

export async function deleteArtifact(artifactId: string, userId: string, env?: Record<string, any>) {
  return usePostgrest(env)
    ? postgrest.deleteArtifact(artifactId, userId, env)
    : sqlite.deleteArtifact(artifactId, userId, env);
}
