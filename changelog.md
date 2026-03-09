# Changelog

All notable changes to bolt2.dyi are documented in this file.

This changelog is specific to the bolt2.dyi fork and does not track upstream bolt.diy release notes.

The format is inspired by Keep a Changelog and follows semantic versioning where practical.

## [Unreleased]

### Added

- None.

### Changed

- None.
- Completed [taskId: bolt2-p0-sidebar-static-topbar-model] [taskId: bolt2-p0-sidebar-static-topbar-model] Sidebar static/collapsible and top-bar model selection completed with validation.
- Completed [taskId: bolt2-p0-send-message-disappears] [taskId: bolt2-p0-send-message-disappears] Send-flow disappearance regression fixed and validated.
- Completed [taskId: bolt2-p0-chatgpt-style-ux-alignment] [taskId: bolt2-p0-chatgpt-style-ux-alignment] Top bar/sidebar/composer hierarchy aligned to cleaner chat UX with tokenized surfaces and validated tests/build.

### Fixed

- None.

## [0.1.3] - 2026-03-09

### Added

- Chat streaming stall guard utilities in `app/components/chat/streamingGuard.ts` with timeout-based stall detection and effective streaming-state resolution.
- Targeted regression tests in `unit-tests/components/chat/streamingGuard.test.ts` for timeout and stalled-UI behavior.
- Explicit three-mode theme selector (Light/Dark/System) in the sidebar theme control.
- Manual ongoing-work full snapshot command (`ongoing:snapshot`) with script `scripts/ongoing-work-snapshot.mjs`.
- GitHub Actions watcher now emits an explicit red operator notice when GitHub API rate limits are hit, including manual package-page verification guidance and n8n fallback polling intervals (+10/+20/+30/+40/+50 minutes).

### Changed

- Theme persistence/runtime now supports `system` mode and follows OS color scheme changes while keeping resolved light/dark rendering for existing consumers.
- Initial page theme bootstrap in `app/root.tsx` now resolves persisted `system` mode correctly before hydration.
- Continued P2/T2 UI standardization on chat and workbench surfaces by consolidating compact primary actions and active/inactive control states into shared token classes.
- Chat send control sizing/placement now uses scale-aligned values (`top-4`, `right-4`, `w-8`, `h-8`) and shared primary icon button styling.
- Ongoing-work normalize/verify logic now detects the uncategorized section by marker text, supporting renamed headings while keeping enforcement active.
- Ongoing-work normalization now writes a full pre-normalize backup snapshot before migration attempts.
- Ongoing-work normalization and cycle completion now always clear stale `DONE` items from `## Prioritized Unfinished Work`, even when changelog insertion is skipped (for example when taskId is already logged).
- Settings control panel information architecture now groups tiles into `General`, `Preferences`, `AI`, `Integrations`, `Security`, and `System` sections for improved scanability while preserving existing tab behavior.
- Vercel dashboard information priority now follows an explicit hierarchy of `Metrics Row`, `Charts Section`, and `Detailed Table Section` for clearer scanning and project-level action flow.
- Vercel dashboard top-journey accessibility hardening now adds keyboard-safe section toggling, stronger focus-visible states, semantic table caption/header scopes, and reduced-motion-aware animation/spinner behavior.
- Starter template pipeline now supports backend/full-stack scaffolding with built-in `FastAPI Backend` and `FastAPI + React Fullstack` options, including local template fallback generation without external repo dependency.
- Starter template pipeline now supports equivalent Node.js stack scaffolding with built-in `Express Backend` and `Express + React Fullstack` options in addition to FastAPI templates.
- n8n orchestration sync/cycle flows now propagate a resolved worker `agentId` (from `BOLT_AGENT_ID`/`N8N_AGENT_ID`/hostname fallback) into open-task rows, cycle notifications, and task-status upserts for clearer multi-worker agentic execution visibility.
- Ongoing bridge prompt/payload now includes resolved `agentId`, explicit PARTIAL-to-DONE closure policy guidance, and command handoff metadata for more agentic autonomous loop execution.
- Ongoing bridge prompt now also resolves and prints effective `callbackUrl` + normalized `returnAddress`, and explicitly instructs agent handoffs to report both values.
- Vercel connection panel modernization now uses shared tokenized UI primitives (`Input`, `Button`) and unified surface/status styling in `app/components/@settings/tabs/vercel/components/VercelConnection.tsx`.
- Completed [taskId: bolt2-p0n-agents-do-not-report-the-callbackurl-and-returnaddres] [taskId: bolt2-p0n-agents-do-not-report-the-callbackurl-and-returnaddres] CallbackUrl/returnAddress now propagate in cycle, keepalive, and auto-continue/build-check flows with listener auto-start and metadata reporting..
- Completed [taskId: bolt2-uncat-kriittinen-bolt-arva-hakemiston-juuressa-oleva-listener-] [taskId: bolt2-uncat-kriittinen-bolt-arva-hakemiston-juuressa-oleva-listener-] Added agent-specific listener config files + agent.id metadata and startup-time config resolution by agent name across listener, cycle, bridge and keepalive scripts..

### Fixed

- P0 chat incident where streaming could stall indefinitely on the three-dot loader and block normal input/send recovery paths.
- Docker startup smoke now uses canonical container log mapping (`BOLT_LOG_DIR=/logs`) and fails fast when mapped host log files are missing or unreadable.
- App wrapper re-export modules (`app/core`, `app/infrastructure`, `app/integrations`, `app/platform`) were corrected to resolve root modules reliably during Docker production builds, and lint enforcement was scoped to avoid false positives on those wrapper files.
- Ongoing-work normalization dedupe now excludes lines from the uncategorized section itself, fixing missed migrations of new uncategorized entries.
- Restored n8n dispatch restart-impulse contract fields (`jobPulse`, `restartCommand`, `nextAction`, `finalRemark`) in workflow definitions to satisfy contract guardrail tests and preserve empty-queue restart semantics.
- `watch-gh-actions` now writes a deterministic status JSON on API/rate-limit failures so automation can detect operator-required publish checks.

## [0.1.2] - 2026-03-07

### Added

- Internal AI SDK MCP compatibility regression unit test to catch missing MCP exports/subpaths before commit/push.
- Push-phase SDK regression command (`test:unit:sdk-regressions`) for repeatable pre-push validation.
- GitHub Actions watcher script to monitor workflow outcomes for pushed SHA (`scripts/watch-gh-actions.mjs`).
- Ongoing-work verification command (`verify:ongoing-work`) to enforce fresh local execution status fields before commit/push.
- Docker startup smoke command (`smoke:docker-startup`) now builds an image, starts a container, enforces host log mapping to `bolt.work/docker-test/logs`, rotates logs to a max of 3 files, and verifies startup logs are clean before push.
- Conditional live AI smoke command (`smoke:ai`) that runs OpenAI endpoint checks when `OPENAI_API_KEY` is available.
- n8n dev orchestration tooling: `scripts/n8n-dev-orchestrator.mjs`, `scripts/n8n-ongoing-cycle.mjs`, and `scripts/ongoing-work-bridge.mjs` for iterative ongoing-work handoff.
- n8n live env-gated smoke test (`test:unit:n8n-live`) and n8n guardrail command (`n8n:guardrail`) for operational policy enforcement.
- Enforced strict GPT-4.1 structured output in n8n workflow: Set node now outputs only `action`, `queueState`, and `commands` for machine-readability and compliance. All narrative fields removed. Orchestration and Data Table sync are now strictly workflow-driven and validated.
- Targeted MCP performance/efficiency unit tests in `unit-tests/lib/services/mcpService.test.ts` covering client refresh cleanup, client reuse during availability checks, and no-op handling for non-result tool invocations.
- Dispatch-loop contract guardrail test (`unit-tests/scripts/n8n-dispatch-contract.test.ts`) to enforce completed-cycle restart impulse fields (`jobPulse` + `restartCommand`).
- Orchestration stats command (`n8n:stats`) and cycle-level `orchestrationStats` reporting for production execution count, failed production executions, failure rate, average runtime, and estimated time saved.
- Open-task sync command (`n8n:sync-open-tasks`) that attempts n8n Data Tables integration and falls back to `bolt.work/n8n/open-tasks-table.json` export when Data Tables API is unavailable.
- Detached GH Actions watcher final-status artifact (`.git/gh-watch-<sha>.status.json`) with strict terminal state tracking (`success` or `fail`) for pushed commits.

### Changed

- MCP service imports were migrated from legacy `ai` subpaths to `@ai-sdk/mcp` and `@ai-sdk/mcp/mcp-stdio` for AI SDK v6 compatibility.
- MCP tool-invocation processing now memoizes `convertToModelMessages` per processed message batch, avoiding repeated conversion work when multiple approved result invocations are present in one assistant message.
- CI workflow changelog gate now runs with direct Node script execution in the test job, removing early-step `pnpm` dependency ordering issues.
- Added mandatory `pre-push` guardrail hook: runs typecheck, changed-file test mapping, SDK regression tests, and starts background GH Actions monitoring.
- GH Actions watcher now supports Docker publication verification and pre-push starts it with `--require-image-publish --image ghcr.io/arvekari/ebolt2` so SHA-tag publication is confirmed after successful workflows.
- CI test workflow ESLint step now scopes to changed `app/**/*.ts(x)` files between base/head refs and uses staged lint flow, preventing baseline-lint debt from failing unrelated pushes while still enforcing regression linting.
- Chat streaming now uses an internal AI SDK v6 compatibility data-stream adapter (`app/lib/.server/llm/data-stream.ts`) instead of removed `ai.createDataStream`/`mergeIntoDataStream` APIs.
- MCP tool-stream formatting now uses `@ai-sdk/ui-utils` data-stream helpers instead of removed `ai.formatDataStreamPart` exports.
- Pre-commit and pre-push hooks now enforce ongoing-work freshness and required status fields.
- Pre-push guardrail flow now includes Docker startup smoke and conditional live AI smoke before allowing push.
- n8n operational workflow naming now enforces `Project-bolt2-` prefix, with retired-workflow pruning and local JSON backup exports under `bolt.arva/n8n`.
- Pre-push Docker publish monitoring now always runs as a background watcher and tracks only final success/fail state via status JSON output.
- Ongoing-cycle receiver now applies project-side response translation so legacy narrative n8n replies are normalized into strict command payloads (`status`, `workflow`, `action`, `queueState`, `commands`) before execution decisions.
- Managed n8n ongoing-work workflow template now emits structured command fields and includes flow-wired Data Table upserts for open-tasks and orchestration-stats payloads.
- Ongoing cycle runtime now validates response/table payload structures and always persists both `bolt.work/n8n/orchestration-stats.latest.json` and `bolt.work/n8n/open-tasks-table.json` on `next`, `done`, and `scan` commands.
- Ongoing cycle now enforces orchestration delivery whenever managed workflows are defined; non-orchestrated cycle commands fail unless an explicit `## Orchestration Enforcement` exception is set in `.ongoing-work.md`.
- Docker startup smoke now exports the locally built smoke image archive to the workspace `composed` directory (`../composed/<image-tag>.tar`) before runtime container validation.
- Ongoing cycle payload now includes a bounded 100-row `taskStatusTable` (active + completed + placeholder rows), separate `openTasksTable` active-task projection, and linked `checkupTable` / `failureTable` metadata for background monitoring correlation.
- n8n managed ongoing-work workflow now upserts from `taskStatusTable` first (fallback to `openTasksTable`) so status monitoring uses one Data Table feed with active filtering support (`isActive`).

### Fixed

- Unit test failures caused by missing `ai/mcp-stdio` export path in AI SDK v6.
- Outdated stream tool-guard expectation that assumed OpenAI tool-calling must always be disabled.
- Unit Tests CI regression where `api.llmcall-errors` mock omitted `isOpenAIResponsesModel`, causing incorrect `500` status instead of token-limit `400` path.
- Runtime server startup crash `The requested module 'ai' does not provide an export named 'createDataStream'` after AI SDK v6 upgrade.
- Live AI smoke `responses` call now uses `max_output_tokens: 16` to satisfy current OpenAI minimum constraint.
- Docker publish verification closure now explicitly confirms both successful CI workflow completion and published GHCR SHA-tag image for the active commit.
- n8n orchestration webhook registration gap: managed webhook nodes now include stable `webhookId` values, restoring `/webhook/*` execution recording and end-to-end cycle notifications.
- `Project-bolt2-ongoing-work-dispatch` loop semantics now emit a restart impulse when a cycle drains (`jobPulse=start-new-ongoing-check-job` + `restartCommand=pnpm run ongoing:cycle -- scan`), enabling automatic follow-up unfinished-work checks as new jobs.
- Docker publish failure handling now auto-triggers GitHub Actions `rerun-failed-jobs` recovery when a failure is detected and a GitHub token is available.

### Verification

- `pnpm exec vitest run unit-tests/lib/services/services.mcp-service.test.ts unit-tests/architecture/layer-structure.test.ts unit-tests/lib/server/stream-text.tools.test.ts unit-tests/lib/services/services.ai-sdk-mcp-compat.test.ts`
- `pnpm run test:unit`
- `pnpm typecheck`

## [0.1.1] - 2026-03-06

### Added

- n8n integration endpoint for workflow deployment via `/api/n8n/workflows`.
- Admin-settings fallback support for n8n credentials when environment variables are not set.
- First-run setup guard that requires database selection before first user creation.
- Auth setup UI branding updates for bolt2.dyi logo usage.
- n8n workflow `update` intent support with payload shape validation in `/api/n8n/workflows`.
- Update notification flow that checks upstream fork version and notifies users when running an older version.
- Optional “Update now” action wiring (`/api/update` intent `auto`) with explicit manual-update fallback messaging.

### Changed

- Authentication and session API routes now return structured JSON fallbacks on backend/network failures.
- PostgREST persistence request handling now degrades gracefully on fetch errors.
- Main README now documents n8n integration behavior and configuration expectations.
- OpenAI provider routing for codex models now targets `responses` model factory instead of legacy completion routing.
- Main branch update setting text now reflects release notification + update-attempt behavior.
- AI SDK dependency stack was upgraded to latest major versions (`ai` and `@ai-sdk/*` family).
- Pre-commit workflow now requires `changelog.md` to be staged for every commit.
- Unit-test mapping script now allows same-commit baseline test file creation instead of hard-failing resolved sequence violations.
- CI workflows now enforce `changelog.md` updates for push/PR change sets and block on lint failures.
- Tool-calling is now kept enabled by default across providers, including OpenAI-compatible routes.
- Pre-commit lint check now validates staged `app/` files to enforce quality gates on the change set without blocking on unrelated repository-wide baseline formatting debt.

### Fixed

- TypeScript typecheck failure in n8n workflows route (`Env` cast compatibility issue).
- First-use auth flow behavior that could surface generic network errors during signup/login scenarios.
- Stream parameter handling for OpenAI-based requests now avoids completion-only misclassification for codex models.
- Collaboration panel sidebar contrast and disabled interaction states were improved for readability/usability.
- AI SDK v6 migration regressions were resolved across chat client/server typing, MCP invocation message conversion, and import/export message shape handling.

### Verification

- Targeted unit tests passed for OpenAI provider routing, stream-tools guard behavior, and update API/client flows.
- Live smoke checks validated current SDK behavior for `gpt-4o` and `gpt-5.3-codex` (`responses` path for codex).
- Added explicit unit tests for update check/self-update client behavior and codex `responses` provider routing.
- Expanded provider unit coverage now validates model factory behavior and dynamic-model parsing for Anthropic, Google, DeepSeek, Cohere, and Mistral.
- TypeScript `pnpm typecheck` passes clean after the migration fixes.

### Known possible issues

- Pre-commit hook enforces test-first mapping: if a changed source file lacks a baseline unit test file, commit is blocked until test skeletons exist.
- `gpt-5.3-codex` may fail on `/chat/completions` in direct API usage; it is expected to work through `responses` routing.
- Runtime self-update is not fully automatic in this environment; `/api/update` currently returns manual update instructions.
- Generated placeholder tests from hook automation may need real assertions before merge-quality completion.

## [0.1.0] - 2026-03-04

### Added

- Initial bolt2.dyi fork-specific changelog baseline.
- Documented first integrated release scope for fork architecture, setup flow hardening, and n8n deployment support.

---

For historical upstream changes before this fork baseline, refer to the original bolt.diy repository release history.
