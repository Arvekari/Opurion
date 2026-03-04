# Changes Done Report

**Project:** Bolt2.dyi  
**Report created:** 2026-03-03  
**Last updated:** 2026-03-03  
**Cutoff requested:** 2026-03-02 13:46 (local time)  
**Verification basis:** file timestamps + this work session history (Git not available in this extracted ZIP workspace)

---

## 0) Executive summary

- Added optional SQLite-based server persistence for API keys, provider settings, custom prompt settings, and DB config.
- Added persistence API (`/api/persistence`) and centralized cookie resolvers with SQLite fallback/sync.
- Migrated multiple API routes from cookie-only reads to resolver-based reads.
- Added settings UI + store support for:
  - custom system prompt overlay (base prompt + user custom instructions)
  - database config (`sqlite` / `postgres` + postgres URL)
- Wired custom prompt into chat system prompt assembly in LLM flow.
- Docker/docs/env updates completed for persistence use.
- Added first implementation of user auth + per-user memory/vectorDB foundation (still in progress).

---

## Update protocol (living document)

This file is now treated as a **living changelog**.

For every new implementation step:

1. Update `Last updated` date.
2. Append changed files into section **1) Confirmed modified files after cutoff** (if new).
3. Update section **2) What was implemented** with delta details.
4. Move items between **4) Not completed yet** and completed sections as they are finished.
5. Keep section **3) Validation status** aligned with latest checks.

---

## 1) Confirmed modified files after cutoff

All files below have `LastWriteTime >= 2026-03-02 13:46`:

- `README.md`
- `app/routes/api.models.ts`
- `app/routes/api.check-env-key.ts`
- `app/routes/api.enhancer.ts`
- `app/routes/api.export-api-keys.ts`
- `app/routes/api.llmcall.ts`
- `app/routes/api.github-stats.ts`
- `app/routes/api.github-branches.ts`
- `app/routes/api.github-user.ts`
- `app/routes/api.netlify-user.ts`
- `app/routes/api.supabase-user.ts`
- `app/routes/api.vercel-user.ts`
- `package.json`
- `app/components/chat/APIKeyManager.tsx`
- `app/components/chat/BaseChat.tsx`
- `app/lib/hooks/useDataOperations.ts`
- `.env.example`
- `docker-compose.yaml`
- `types/sqlite-persistence.d.ts`
- `app/lib/.server/persistence/sqlite-memory.ts`
- `app/lib/api/cookies.ts`
- `app/routes/api.persistence.ts`
- `app/routes/api.chat.ts`
- `app/lib/persistence/serverPersistence.client.ts`
- `app/lib/stores/settings.ts`
- `app/lib/.server/llm/stream-text.ts`
- `app/lib/hooks/useSettings.ts`
- `app/components/@settings/tabs/features/FeaturesTab.tsx`
- `app/lib/.server/auth.ts`
- `app/routes/api.auth.signup.ts`
- `app/routes/api.auth.login.ts`
- `app/routes/api.auth.logout.ts`
- `app/routes/api.auth.session.ts`
- `app/components/auth/AuthGate.tsx`
- `app/routes/_index.tsx`
- `app/lib/.server/persistence/index.ts`
- `app/lib/.server/persistence/postgrest-memory.ts`
- `scripts/setup-db.mjs`
- `docs/postgrest-schema.sql`
- `app/routes/api.collab.projects.ts`
- `app/routes/api.collab.conversations.ts`
- `app/routes/api.collab.branches.ts`
- `app/lib/modules/llm/providers/openai.ts`
- `app/components/sidebar/CollabPanel.tsx`
- `app/lib/stores/collab.ts`
- `app/components/chat/Chat.client.tsx`
- `app/routes/api.system-settings.ts`
- `docs/next-phase-implementation-plan.md`
- `unit-tests/README.md`
- `unit-tests/routes/api.persistence.test.ts`
- `unit-tests/routes/api.system-settings.test.ts`
- `unit-tests/routes/api.auth.login.test.ts`
- `unit-tests/routes/api.auth.session-logout.test.ts`
- `unit-tests/routes/api.auth.signup.test.ts`
- `unit-tests/routes/api.check-env-key.test.ts`
- `unit-tests/routes/api.configured-providers.test.ts`
- `unit-tests/routes/api.enhancer.test.ts`
- `unit-tests/routes/api.export-api-keys.test.ts`
- `unit-tests/routes/api.health.test.ts`
- `unit-tests/routes/api.mcp-check.test.ts`
- `unit-tests/routes/api.models.test.ts`
- `unit-tests/stores/collab-store.test.ts`
- `unit-tests/routes/api.update.test.ts`
- `unit-tests/utils/classNames.test.ts`
- `unit-tests/utils/formatSize.test.ts`
- `unit-tests/utils/getLanguageFromExtension.test.ts`
- `unit-tests/utils/prompt-library.test.ts`
- `unit-tests/utils/stripIndent.test.ts`
- `unit-tests/utils/url.test.ts`
- `.github/workflows/unit-tests.yml`
- `scripts/verify-unit-tests.mjs`

---

## 2) What was implemented

### A) Optional SQLite persistence for settings/keys

Implemented optional server-side SQLite persistence (file-based) with Docker-friendly default path:

- Enable flag: `BOLT_SQLITE_PERSISTENCE_ENABLED=true`
- Path override: `BOLT_SQLITE_PERSISTENCE_PATH`
- Docker default path: `/data/bolt-memory.sqlite`

Core implementation:

- `app/lib/.server/persistence/sqlite-memory.ts`

Stored data model now includes:

- `apiKeys`
- `providerSettings`
- `customPrompt` (`enabled`, `instructions`)
- `dbConfig` (`provider`, `postgresUrl`)

### B) Centralized cookie -> SQLite fallback/sync resolvers

Updated cookie utility to support resolver-based reads with persistence fallback/sync:

- `resolveApiKeys(...)`
- `resolveProviderSettings(...)`
- `resolveCustomPrompt(...)`
- `resolveDbConfig(...)`

File:

- `app/lib/api/cookies.ts`

### C) New persistence API endpoint

Added endpoint for reading/updating persisted data:

- `GET /api/persistence`
- `POST /api/persistence`

File:

- `app/routes/api.persistence.ts`

### D) Client-side sync helper

Added helper to sync UI-side updates to server persistence:

- `syncServerPersistence(...)`

File:

- `app/lib/persistence/serverPersistence.client.ts`

### E) Server routes switched to resolver-based key/settings reads

Migrated from direct cookie-only reads to resolver-based reads in API routes:

- `app/routes/api.chat.ts`
- `app/routes/api.models.ts`
- `app/routes/api.check-env-key.ts`
- `app/routes/api.enhancer.ts`
- `app/routes/api.llmcall.ts`
- `app/routes/api.export-api-keys.ts`
- `app/routes/api.github-branches.ts`
- `app/routes/api.github-stats.ts`
- `app/routes/api.github-user.ts`
- `app/routes/api.netlify-user.ts`
- `app/routes/api.supabase-user.ts`
- `app/routes/api.vercel-user.ts`

### F) UI writes now sync to persistence

Updated places that write API keys/provider settings to also sync server persistence:

- `app/components/chat/APIKeyManager.tsx`
- `app/components/chat/BaseChat.tsx`
- `app/lib/hooks/useSettings.ts`
- `app/lib/hooks/useDataOperations.ts`

### G) Prompt customization feature (base prompt + custom overlay)

Added configurable custom system prompt flow:

- Keep selecting one of the three prompt-library base prompts
- Add custom instructions appended to system prompt
- Toggle custom prompt on/off
- Persist in local settings + optional server SQLite

Files:

- `app/components/@settings/tabs/features/FeaturesTab.tsx`
- `app/lib/stores/settings.ts`
- `app/lib/hooks/useSettings.ts`
- `app/routes/api.chat.ts`
- `app/lib/.server/llm/stream-text.ts`

### H) Database connection config in Settings

Added settings-level DB config state/UI:

- Provider selector: `sqlite` or `postgres`
- PostgreSQL URL input
- Stored locally and synced to optional SQLite persistence

Files:

- `app/components/@settings/tabs/features/FeaturesTab.tsx`
- `app/lib/stores/settings.ts`
- `app/lib/hooks/useSettings.ts`
- `app/lib/.server/persistence/sqlite-memory.ts`
- `app/lib/api/cookies.ts`
- `app/routes/api.persistence.ts`

### I) Dependency/config/docs updates

- Added dependency: `sql.js` in `package.json`
- Added TS declaration shims: `types/sqlite-persistence.d.ts`
- Added Docker persistent volume mapping for `/data`: `docker-compose.yaml`
- Added env documentation for SQLite persistence: `.env.example`
- Added README notes for optional persistence setup: `README.md`

### J) User accounts + per-user data foundation (new, in progress)

Implemented initial authentication and per-user persistence groundwork:

- Added SQLite schema and server helpers for:
  - `users`
  - `sessions`
  - `user_memory`
  - `user_vectors`
- Added session/auth helper (`hashing`, cookie session handling):
  - `app/lib/.server/auth.ts`
- Added auth API routes:
  - `POST /api/auth/signup`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/session`
- Added first-use auth gate in UI:
  - `app/components/auth/AuthGate.tsx`
  - Wrapped in `app/routes/_index.tsx`
- Updated resolver path to support user-scoped persistence via `bolt_uid` cookie in `app/lib/api/cookies.ts`.

Notes:

- This is a functional foundation, not yet a full production auth system.
- Password hashing is currently SHA-256 + salt (upgrade planned to stronger KDF such as Argon2/PBKDF2 in a next hardening step).

### K) DB abstraction layer (`sqlite` / external `postgrest`) + external install path

Implemented server-side persistence abstraction that routes operations through one interface:

- New adapter entrypoint: `app/lib/.server/persistence/index.ts`
- SQLite implementation kept in: `app/lib/.server/persistence/sqlite-memory.ts`
- External PostgREST implementation: `app/lib/.server/persistence/postgrest-memory.ts`

Selection behavior:

- `BOLT_SERVER_DB_PROVIDER=sqlite` -> uses SQLite persistence module
- `BOLT_SERVER_DB_PROVIDER=postgrest` -> uses external PostgREST endpoint

Important scope rule now enforced:

- PostgreSQL and PostgREST are **not bundled** in this project package
- No in-repo DB service was added for those components
- Integration is config-driven and expects external infrastructure

Support assets added:

- External PostgreSQL schema: `docs/postgrest-schema.sql`
- First-time config helper script (writes `.env.local` only): `scripts/setup-db.mjs`
- NPM command: `pnpm run setup:db`
- Env/README instructions for external PostgREST setup

### L) Shared internal collaboration (projects + shared conversations)

Added backend support for user-to-user internal project sharing and shared discussion threads:

- New collaboration APIs:
  - `GET/POST /api/collab/projects`
  - `GET/POST /api/collab/conversations`
- Capabilities:
  - create project
  - share project to another user by username (`owner/editor/viewer` model)
  - list project members
  - create shared conversation under a project
  - append/list messages in shared conversation

Persistence implementation added to both backends:

- SQLite tables: `collab_projects`, `collab_project_members`, `collab_conversations`, `collab_messages`
- PostgreSQL schema now includes equivalent tables in `docs/postgrest-schema.sql`

### O) Branch-based shared conversation workflow (`main` + per-user branches + merge)

Extended collaboration model so each shared conversation supports:

- one shared `main` branch
- per-user working branch (auto-created when user works in shared conversation)
- merge command from user branch into `main`

API/runtime updates:

- `api.collab.conversations` now supports branch-aware read/write via `branchMode` / `branchId`
- new branch route:
  - `GET /api/collab/branches?conversationId=...`
  - `POST /api/collab/branches` with intent `mergeToMain`

SQLite updates (used when PostgreSQL/PostgREST is not in use):

- Added tables: `collab_branches`, `collab_branch_messages`
- Added table: `agent_runs` (persisted backend agent orchestration run records)
- Message writes now target branch storage (default user branch unless `main` requested)

PostgreSQL schema updates:

- Added equivalent tables: `collab_branches`, `collab_branch_messages`
- Added equivalent table: `agent_runs` (+ updated-at index)
- Included indexes for branch/conversation message access

### P) Collaboration UI integration (completed)

Integrated shared conversation workflow into the actual app UI and chat runtime:

- Added sidebar collaboration panel:
  - project create/select
  - share project to user by username
  - shared conversation create/select
  - branch mode switch (`my branch` / `main`)
  - merge branch into `main`
- Added collaboration state store for selected project/conversation/branch mode.
- Connected chat runtime to collaboration APIs:
  - load messages from selected shared conversation branch
  - append user and assistant messages into selected branch
  - refresh behavior after branch merge/selection updates

Files:

- `app/components/sidebar/CollabPanel.tsx`
- `app/components/sidebar/Menu.client.tsx`
- `app/lib/stores/collab.ts`
- `app/components/chat/Chat.client.tsx`

### M) OpenAI Codex model support (including GPT-5.x Codex)

Extended OpenAI provider model support so codex-family models are selectable/usable:

- Added static model entries:
  - `gpt-5-codex`
  - `gpt-5.1-codex`
  - `gpt-5.2-codex`
  - `gpt-5.3-codex`
- Dynamic model discovery filter now accepts codex-style identifiers (`codex*`, `*-codex`).
- Token limits now resolve dynamically from selected model metadata when available (`context_length`/`context_window` + output token limit fields), with codex-aware fallback values.
- Runtime `stream-text` now prefers provider dynamic model metadata over static fallback, so selected model token caps follow actual model capabilities more accurately.

### N) Strict backend routing rule (`postgrest` means no SQLite reads)

Adjusted persistence adapter behavior:

- If `BOLT_SERVER_DB_PROVIDER=postgrest`, code now routes only to PostgREST implementation.
- SQLite fallback is disabled in that mode.
- `isPersistenceEnabled(...)` reports status based on selected backend only.

### Q) Two-level user roles + system settings vs user settings separation

Implemented clear role and settings separation model:

- User levels are now explicitly used as:
  - `admin` (global system settings access)
  - normal `user` (own user settings only)
- Existing signup behavior remains: first created account becomes admin, next accounts are normal users.

Settings scope behavior now:

- `/api/persistence` now uses authenticated user context and writes/reads user-scoped settings via `readPersistedMemoryForUser` / `upsertPersistedMemoryForUser`.
- Added admin-only global settings endpoint:
  - `GET /api/system-settings`
  - `POST /api/system-settings`
- Non-admin users are denied from system settings API.

Admin system settings UI added in Features tab:

- Apache/PHP generic server target configuration (global):
  - enabled
  - FTP host/port/user/password
  - server root path
  - public base URL
- n8n workflow target configuration (global):
  - enabled
  - base URL
  - API key

Files:

- `app/routes/api.persistence.ts`
- `app/routes/api.system-settings.ts`
- `app/components/@settings/tabs/features/FeaturesTab.tsx`

### R) Next-phase implementation planning document (requested roadmap topics)

Added a dedicated implementation plan markdown for the requested roadmap items:

- File Locking & Diff Improvements
- Backend Agent Architecture
- LLM Prompt Optimization (small models)
- Project Planning Documentation (LLM-generated markdown)
- VSCode-style confirmation workflows
- Document Upload for Knowledge
- Additional provider integrations (Azure OpenAI, Vertex AI, Granite)

The plan includes:

- MVP scope per topic
- technical tasks
- acceptance criteria
- recommended delivery sequence and risks

File:

- `docs/next-phase-implementation-plan.md`

### S) Project-wide unit test baseline and enforcement workflow

Added a dedicated `unit-tests` project testing structure and enforcement workflow for ongoing feature development.

Implemented now:

- New root test suite folder with guide:
  - `unit-tests/README.md`
- Initial unit tests for critical updated behavior:
  - `unit-tests/routes/api.persistence.test.ts`
  - `unit-tests/routes/api.system-settings.test.ts`
  - `unit-tests/stores/collab-store.test.ts`
  - `unit-tests/utils/getLanguageFromExtension.test.ts`
  - `unit-tests/utils/prompt-library.test.ts`
- New script to enforce “changed source file -> matching test file” policy:
  - `scripts/verify-unit-tests.mjs`
- CI workflow for forks/open-source flow:
  - `.github/workflows/unit-tests.yml`
  - runs `pnpm run test:unit`
  - runs `pnpm run test:unit:changed`

NPM scripts added:

- `pnpm run test:unit`
- `pnpm run test:unit:watch`
- `pnpm run test:unit:changed`
- `pnpm run test:coverage`

Coverage roadmap/status updates:

- Added milestone roadmap in `unit-tests/README.md` (M1..M6 toward 100%).
- Added current completion percentages from latest coverage run:
  - Statements: `6.13%`
  - Lines: `6.13%`
  - Functions: `20.52%`
  - Branches: `44.82%`
- Added milestone progress note (currently pre-M1).

Next unit-test batch implemented:

- Auth routes:
  - `unit-tests/routes/api.auth.login.test.ts`
  - `unit-tests/routes/api.auth.signup.test.ts`
  - `unit-tests/routes/api.auth.session-logout.test.ts`
- Health route:
  - `unit-tests/routes/api.health.test.ts`
- Utility coverage expansions:
  - `unit-tests/utils/classNames.test.ts`
  - `unit-tests/utils/stripIndent.test.ts`
  - `unit-tests/utils/formatSize.test.ts`
  - `unit-tests/utils/url.test.ts`

Additional route coverage expansion cycle implemented:

- `unit-tests/routes/api.check-env-key.test.ts`
- `unit-tests/routes/api.configured-providers.test.ts`
- `unit-tests/routes/api.models.test.ts`

Further route coverage expansion cycle implemented:

- `unit-tests/routes/api.enhancer.test.ts`
- `unit-tests/routes/api.export-api-keys.test.ts`
- `unit-tests/routes/api.update.test.ts`
- `unit-tests/routes/api.mcp-check.test.ts`
- `unit-tests/routes/api.github-branches.test.ts`
- `unit-tests/routes/api.github-stats.test.ts`
- `unit-tests/routes/api.github-template.test.ts`
- `unit-tests/routes/api.git-info.test.ts`
- `unit-tests/routes/api.gitlab-projects.test.ts`
- `unit-tests/routes/api.gitlab-branches.test.ts`
- `unit-tests/routes/api.netlify-deploy.test.ts`
- `unit-tests/routes/api.supabase-user.test.ts`
- `unit-tests/routes/api.system.diagnostics.test.ts`
- `unit-tests/routes/api.system.disk-info.test.ts`
- `unit-tests/routes/api.web-search.test.ts`
- `unit-tests/routes/api.vercel-deploy.test.ts`

Note:

- Full 100% project-wide exhaustive unit coverage cannot be completed in a single step for this codebase size; this update establishes the enforceable baseline and automated policy so coverage can grow continuously with each feature PR.

---

## 3) Validation status

- Targeted type/error checks for modified persistence/prompt files passed during session.
- Targeted checks for new adapter files also passed:
  - `app/lib/.server/persistence/index.ts`
  - `app/lib/.server/persistence/postgrest-memory.ts`
  - `app/routes/api.persistence.ts`
  - `app/lib/.server/auth.ts`
- Additional targeted checks passed for this implementation batch:
  - `app/routes/api.collab.projects.ts`
  - `app/routes/api.collab.conversations.ts`
  - `app/lib/modules/llm/providers/openai.ts`
  - `docs/postgrest-schema.sql`
- Additional targeted checks passed for dynamic codex token update:
  - `app/lib/.server/llm/stream-text.ts`
  - `app/lib/modules/llm/providers/openai.ts`
- Additional targeted checks passed for branch workflow update:
  - `app/lib/.server/persistence/sqlite-memory.ts`
  - `app/lib/.server/persistence/postgrest-memory.ts`
  - `app/lib/.server/persistence/index.ts`
  - `app/routes/api.collab.conversations.ts`
  - `app/routes/api.collab.branches.ts`
  - `docs/postgrest-schema.sql`
- Additional targeted checks passed for collaboration UI integration:
  - `app/components/sidebar/CollabPanel.tsx`
  - `app/components/sidebar/Menu.client.tsx`
  - `app/lib/stores/collab.ts`
  - `app/components/chat/Chat.client.tsx`
- Additional targeted checks passed for role/scope/system-settings update:
  - `app/routes/api.persistence.ts`
  - `app/routes/api.system-settings.ts`
  - `app/components/@settings/tabs/features/FeaturesTab.tsx`
- Unit test baseline validation passed:
  - `pnpm run test:unit` -> 35 files, 114 tests passed
  - `pnpm run test:unit:changed` -> policy script executed (no git diff context in extracted workspace)
- Full coverage run executed and documented:
  - `pnpm run test:coverage` -> generated coverage report and updated roadmap percentages in `unit-tests/README.md` (Statements `8.87%`, Functions `23.88%`, Branches `47.05%`, Lines `8.87%`; single-score total completion `8.87/100%`)
- Full project `pnpm run typecheck` was not fully clean due to pre-existing/build-artifact issue in `functions/[[path]].ts` (`../build/server` missing), not caused by these feature changes.

---

## 4) Not completed yet (requested but still pending)

The following requested scope is **not finished yet**:

1. Hardened user account management (password policy, KDF hardening, account lifecycle)
2. Full settings/chat runtime migration to strict per-user model in all pathways
3. Existing chat history migration strategy from global state to per-user ownership
4. VectorDB usage integration into chat/context pipeline (current step has storage/search helpers only)
5. PostgreSQL/PostgREST production hardening (RLS policy model, secret management, operational runbook)

Current state provides a solid persistence/settings foundation, but not a complete auth + per-user data architecture yet.

---

## 5) Recommended next implementation phase

1. Upgrade password hashing to strong KDF (Argon2/PBKDF2) and add policy controls
2. Complete strict `user_id` scoping across all chat/history pathways
3. Integrate vector retrieval into prompt/context assembly path
4. Add first-login migration from global memory to user-owned records
5. Add PostgREST security hardening and operational validation checklist

---

## OpenClaw integration and platform architecture baseline (new)

Completed in this cycle:

- OpenClaw integration path is completed in agent orchestration API:
  - dedicated OpenClaw adapter module (`execute`, `cancel`, `status`)
  - remote status attached to `GET /api/agent-runs?runId=...` when available
  - remote cancel delegation on OpenClaw run cancellation
- Dual-backend persistence parity kept for agent run entities (`sqlite` + `postgrest`).
- Added core/platform structure foundation:
  - `app/core` (model router + chat stream facade)
  - `app/platform` (security, request context, schema version module)
  - `app/extensions` (OpenClaw adapter)
  - `app/ui` layer boundary docs
- Added auth route request guard baseline:
  - request-id tracking
  - basic configurable rate limiting on auth endpoints
- Added observability baseline:
  - `/api/health` startup checks + request id
  - `/api/metrics` endpoint
- Added deployment/docs artifacts:
  - `INSTALL.md`
  - `API.md`
  - `docker-compose.production.yaml`

Validation:

- Targeted tests for OpenClaw + platform/core layers passed.
- Full `pnpm run test:unit` passed: **280 files / 477 tests**.

---

## Documentation tree completion update (latest)

Completed requested documentation hierarchy under `docs/docs`:

- `setup/docker/*`
- `setup/single-host/*`
- `architecture/*`
- `database/*`
- `integrations/*`
- `security/*`
- `api/*`
- `development/*`
- `operations/*`

Added/updated MkDocs navigation:

- `docs/mkdocs.yml` now contains full `nav` entries for all above sections and pages.

Latest validation snapshots:

- Pre-doc-completion full run: **290 files / 503 tests passed**
- Post-doc-completion full run: **290 files / 503 tests passed**
