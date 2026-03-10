-- External PostgreSQL schema for Bolt2.dyi PostgREST backend
-- Apply this in your own PostgreSQL instance (outside this repository/package).

create table if not exists app_memory (
  id integer primary key,
  api_keys jsonb not null default '{}'::jsonb,
  provider_settings jsonb not null default '{}'::jsonb,
  custom_prompt jsonb not null default '{"enabled":false,"instructions":""}'::jsonb,
  db_config jsonb not null default '{"provider":"sqlite","postgresUrl":""}'::jsonb,
  updated_at timestamptz not null default now(),
  check (id = 1)
);

create table if not exists users (
  id text primary key,
  username text unique not null,
  password_hash text not null,
  password_salt text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token text primary key,
  user_id text not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists user_memory (
  user_id text primary key references users(id) on delete cascade,
  api_keys jsonb not null default '{}'::jsonb,
  provider_settings jsonb not null default '{}'::jsonb,
  custom_prompt jsonb not null default '{"enabled":false,"instructions":""}'::jsonb,
  db_config jsonb not null default '{"provider":"sqlite","postgresUrl":""}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists user_vectors (
  id bigserial primary key,
  user_id text not null references users(id) on delete cascade,
  namespace text not null,
  source_id text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_vectors_user_namespace on user_vectors(user_id, namespace);

create table if not exists agent_runs (
  run_id text primary key,
  state text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_runs_updated_at on agent_runs(updated_at desc);

create table if not exists collab_projects (
  id text primary key,
  name text not null,
  owner_user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists collab_project_members (
  project_id text not null references collab_projects(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  invited_by_user_id text references users(id),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists collab_conversations (
  id text primary key,
  project_id text not null references collab_projects(id) on delete cascade,
  title text not null,
  created_by_user_id text not null references users(id),
  created_at timestamptz not null default now()
);

create table if not exists collab_messages (
  id bigserial primary key,
  conversation_id text not null references collab_conversations(id) on delete cascade,
  user_id text not null references users(id),
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_collab_project_members_user on collab_project_members(user_id);
create index if not exists idx_collab_conversations_project on collab_conversations(project_id);
create index if not exists idx_collab_messages_conversation on collab_messages(conversation_id, created_at);

create table if not exists collab_branches (
  id text primary key,
  conversation_id text not null references collab_conversations(id) on delete cascade,
  name text not null,
  owner_user_id text not null references users(id),
  source_branch_id text references collab_branches(id),
  is_main boolean not null default false,
  status text not null default 'active' check (status in ('active', 'merged')),
  merged_into_branch_id text references collab_branches(id),
  created_at timestamptz not null default now(),
  merged_at timestamptz,
  unique (conversation_id, name)
);

create table if not exists collab_branch_messages (
  id bigserial primary key,
  branch_id text not null references collab_branches(id) on delete cascade,
  user_id text not null references users(id),
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_collab_branches_conversation on collab_branches(conversation_id, created_at);
create index if not exists idx_collab_branch_messages_branch on collab_branch_messages(branch_id, created_at);

create table if not exists collab_artifacts (
  id text primary key,
  project_id text references collab_projects(id) on delete cascade,
  owner_user_id text not null references users(id) on delete cascade,
  name text not null,
  description text,
  artifact_type text not null check (artifact_type in ('module', 'component', 'snippet', 'asset')),
  visibility text not null default 'private' check (visibility in ('private', 'project', 'public')),
  content text not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_collab_artifacts_project on collab_artifacts(project_id) where project_id is not null;
create index if not exists idx_collab_artifacts_owner on collab_artifacts(owner_user_id);
create index if not exists idx_collab_artifacts_visibility on collab_artifacts(visibility);

insert into app_memory (id)
values (1)
on conflict (id) do nothing;
