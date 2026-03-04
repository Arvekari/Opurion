# Next Phase Implementation Plan

Date: 2026-03-03
Scope: multi-sprint roadmap for architecture and UX upgrades

## 1) File Locking & Diff Improvements

### Goal

Reduce edit conflicts in collaborative and agent-driven changes, and make conflict resolution explicit.

### MVP scope

- Add branch-aware file lock owner metadata (user + branch + timestamp).
- Add lock TTL and stale lock recovery.
- Add lock conflict payload that includes current owner and changed files.
- Improve diff UX for conflict flows: keep/replace/manual merge actions.

### Technical tasks

- Extend lock model in server persistence modules (sqlite + postgrest parity).
- Add lock acquire/release/status APIs with atomic checks.
- Add conflict-aware response format in edit/write pathways.
- Update UI components handling diffs and write conflicts.

### Acceptance criteria

- Two users editing same file receive deterministic lock behavior.
- Stale locks recover automatically after TTL.
- User sees diff and can choose keep current / overwrite / merge.

---

## 2) Backend Agent Architecture

### Goal

Move from single-shot model calls to orchestrated agent runs with task state.

### MVP scope

- Introduce agent run entity: runId, state, steps, outputs.
- Split request flow into plan -> execute -> verify stages.
- Persist agent run metadata and step logs for replay/debug.
- Add cancellation and timeout handling.

### Technical tasks

- Create agent service layer under app/lib/.server/agents.
- Add run store APIs (/api/agent-runs start/status/cancel).
- Integrate existing LLM call path as execution engine in first version.
- Add UI status panel for active run and step transitions.

### Acceptance criteria

- Long tasks continue as multi-step run with visible status.
- Failed step returns partial progress and structured error.
- Runs are resumable/reviewable from persisted logs.

Make a possibility to integrate Open-claw https://openclaw.ai/

---

## 3) LLM Prompt Optimization (Small Models)

### Goal

Increase answer quality and reduce token usage for small-context or low-cost models.

### MVP scope

- Add model-class aware prompt profiles (small/standard/large).
- Add concise system prompt variant for small models.
- Add automatic context pruning and instruction compaction.
- Add token budget guardrails before request dispatch.

### Technical tasks

- Add prompt policy module with profile selection by model metadata.
- Add compact instruction normalizer.
- Add context compressor before stream-text call.
- Log selected profile for diagnostics.

### Acceptance criteria

- Smaller models receive shorter prompt and bounded context.
- Fewer over-limit requests.
- Maintained task success on benchmark prompts.

---

## 4) Project Planning Documentation (LLM -> Markdown)

### Goal

Generate implementation plans directly as markdown artifacts.

### MVP scope

- Add plan generation command/route with markdown output schema.
- Save plan to workspace docs path with deterministic filename.
- Include sections: goals, architecture, milestones, risks, validation.

### Technical tasks

- Add route /api/plans/generate (input: objective + constraints).
- Add markdown generator helper with template and normalization.
- Add UI trigger in settings/tools area (admin or developer mode).

### Acceptance criteria

- User can generate a plan markdown file in one action.
- Output follows consistent structure and references selected scope.

---

## 5) VS Code Integration (Git-like Confirmations)

### Goal

Provide explicit confirmation workflows similar to git staging/commit checks.

### MVP scope

- Add confirmation gate before destructive edits/deletes.
- Add staged change summary panel before apply.
- Add per-file accept/reject workflow.

### Technical tasks

- Add change-intent model (proposed/accepted/rejected).
- Add UI sheet with file-level decisions.
- Integrate with existing diff and lock handling.

### Acceptance criteria

- User can approve/reject file changes before write.
- Destructive actions require explicit confirmation.

---

## 6) Document Upload for Knowledge

### Goal

Allow users to upload reference docs/coding standards and use them in responses.

### MVP scope

- Upload markdown/pdf/txt files.
- Extract plain text + chunk + index under user/project scope.
- Query top matching chunks and inject into context.

### Technical tasks

- Add upload API + storage metadata table.
- Add parser pipeline and chunker.
- Reuse user_vectors for embeddings/retrieval.
- Add settings toggle for “use uploaded knowledge in chat”.

### Acceptance criteria

- Uploaded docs searchable in conversation context.
- Retrieval remains user/project scoped.

---

## 7) Additional Provider Integrations

### Goal

Add Azure OpenAI, Vertex AI, and Granite provider support with parity to existing provider UX.

### MVP scope

- Add provider adapters and model listing.
- Add settings fields for each provider auth style.
- Add validation endpoint for provider connectivity.

### Technical tasks

- Azure OpenAI: endpoint, deployment-name model mapping, API version handling.
- Vertex AI: project/location/service account auth and model calls.
- Granite: adapter via supported endpoint/auth mode.
- Register in provider lists and model discovery flow.

### Acceptance criteria

- Each provider can list models (or configured deployments) and run chat calls.
- Provider settings persist and are validated.

---

## Delivery Sequence (Recommended)

1. Prompt optimization for small models
2. Project planning markdown generator
3. File locking + diff conflict improvements
4. Agent run architecture (phase 1)
5. Document upload + retrieval
6. VS Code style confirmation workflow
7. New provider integrations (parallelizable by provider)

## Risks

- Agent architecture and conflict controls touch core chat/edit flows.
- Upload/retrieval can increase token and latency costs without strict budgets.
- Provider integrations need robust auth validation and fallback UX.

## Definition of Done (Global)

- sqlite and postgrest parity for new persisted entities
- role/scope checks enforced (admin/system vs user/project)
- targeted diagnostics clean for touched files
- docs updated in changes-done.md and README/feature docs as needed

The following requested scope is **not finished yet**:

1. Hardened user account management (password policy, KDF hardening, account lifecycle)
2. Full settings/chat runtime migration to strict per-user model in all pathways
3. Existing chat history migration strategy from global state to per-user ownership
4. VectorDB usage integration into chat/context pipeline (current step has storage/search helpers only)
5. PostgreSQL/PostgREST production hardening (RLS policy model, secret management, operational runbook)

Current state provides a solid persistence/settings foundation, but not a complete auth + per-user data architecture yet.

---

## Recommended next implementation phase

1. Upgrade password hashing to strong KDF (Argon2/PBKDF2) and add policy controls
2. Complete strict `user_id` scoping across all chat/history pathways
3. Integrate vector retrieval into prompt/context assembly path
4. Add first-login migration from global memory to user-owned records
5. Add PostgREST security hardening and operational validation checklist
