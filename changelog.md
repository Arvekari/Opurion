# Changelog

All notable changes to bolt2.dyi are documented in this file.

This changelog is specific to the bolt2.dyi fork and does not track upstream bolt.diy release notes.

The format is inspired by Keep a Changelog and follows semantic versioning where practical.

## [Unreleased]

### Added

- Internal AI SDK MCP compatibility regression unit test to catch missing MCP exports/subpaths before commit/push.

### Changed

- MCP service imports were migrated from legacy `ai` subpaths to `@ai-sdk/mcp` and `@ai-sdk/mcp/mcp-stdio` for AI SDK v6 compatibility.
- CI workflow changelog gate now runs with direct Node script execution in the test job, removing early-step `pnpm` dependency ordering issues.

### Fixed

- Unit test failures caused by missing `ai/mcp-stdio` export path in AI SDK v6.
- Outdated stream tool-guard expectation that assumed OpenAI tool-calling must always be disabled.

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
