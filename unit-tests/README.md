# Unit Tests Guide

This folder contains project-level unit tests for `Bolt2.dyi`.

## Goals

- Verify core behavior after every change.
- Require new tests when adding new features.
- Keep tests deterministic and fast.

## Commands

- Run unit tests: `pnpm run test:unit`
- Watch mode: `pnpm run test:unit:watch`
- Validate changed files have tests: `pnpm run test:unit:changed`
- Run full project coverage report: `pnpm exec vitest --run --coverage`

## Current coverage status

Coverage is **not yet 100%** for the full project.

### Covered now (unit-tests + existing project tests)

- Routes:
  - `api.bug-report`
  - `api.check-env-key`
  - `api.collab.branches`
  - `api.collab.conversations`
  - `api.collab.projects`
  - `api.configured-providers`
  - `api.persistence`
  - `api.system-settings`
  - `api.auth.login`
  - `api.auth.signup`
  - `api.auth.session`
  - `api.auth.logout`
  - `api.enhancer`
  - `api.export-api-keys`
  - `api.models`
  - `api.mcp-check`
  - `api.health`
  - `api.llmcall`
  - `api.models.$provider`
  - `api.update`
  - `api.github-branches`
  - `api.github-stats`
  - `api.github-template`
  - `api.git-info`
  - `api.git-proxy`
  - `api.gitlab-projects`
  - `api.gitlab-branches`
  - `api.mcp-update-config`
  - `api.netlify-deploy`
  - `api.supabase-user`
  - `api.supabase`
  - `api.supabase.variables`
  - `api.supabase.query`
  - `api.system.diagnostics`
  - `api.system.disk-info`
  - `api.system.git-info`
  - `api.vercel-deploy`
  - `api.web-search`
- Stores:
  - `collab` store behavior
- Persistence modules:
  - `localStorage`
  - `chats`
  - `index` barrel exports
  - `db`
  - `lockedFiles`
- Utilities:
  - `buffer`
  - `constants`
  - `debounce`
  - `easings`
  - `fileLocks`
  - `diff`
  - `fileUtils`
  - `getLanguageFromExtension`
  - `getTemplates`
  - `githubStats`
  - `gitlabStats`
  - `classNames`
  - `formatSize`
  - `logger`
  - `markdown`
  - `mobile`
  - `os`
  - `path`
  - `projectCommands`
  - `promises`
  - `react`
  - `selectStarterTemplate`
  - `stripIndent`
  - `stacktrace`
  - `sampler`
  - `shell` (`cleanTerminalOutput`)
  - `terminal`
  - `unreachable`
  - `url`
  - `PromptLibrary` basics
- Common prompt modules:
  - `prompts/prompts` (`getSystemPrompt`)
  - `prompts/new-prompt` (`getFineTunedPrompt`)
  - `prompts/optimized`
  - `prompts/discuss-prompt`
- Existing project tests outside this folder also cover parts of diff/message parsing.

### Missing / low coverage areas (high level)

Based on latest `vitest --coverage` output, large gaps remain in:

- Most UI components (`app/components/**`)
- Most route handlers (`app/routes/**`) outside the auth/persistence/system-settings set above
- Many hooks and stores (`app/lib/hooks/**`, `app/lib/stores/**`)
- Persistence internals and services (`app/lib/persistence/**`, `app/lib/services/**`)
- Electron and scripts (`electron/**`, `scripts/**`)

These areas currently include many files at or near `0%` coverage.

## Coverage improvement policy

- For each feature/fix, add or update tests in the same PR.
- If a changed source file has no matching test, `test:unit:changed` should fail in CI.
- Raise coverage progressively by module batches (routes, stores, utils, hooks, components).

## Coverage roadmap

This project will move toward 100% in controlled milestones.

### Current completion (latest run)

- Statements: **14.12%**
- Lines: **14.12%**
- Functions: **34.66%**
- Branches: **61.73%**

Overall total completion (single score): **14.12/100%**

Latest full unit run summary:

- Test Files: **290 passed (290)**
- Tests: **503 passed (503)**

Source: latest `pnpm run test:unit` local run (coverage percentages remain from latest `pnpm run test:coverage`).

### Cycle log (Cycle 1 -> Cycle 60)

This section tracks each cycle explicitly. If any values overlap between cycles, the newest cycle is authoritative.

| Cycle | Tests added in cycle                                                                                                                                                                         | Unit test totals at cycle end | Coverage single score at cycle end | Effective status after latest cycle      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------- | ---------------------------------------- |
| 1     | `api.system.git-info`, `api.mcp-update-config`, `api.git-proxy`                                                                                                                              | 35 files / 114 tests          | 8.87/100%                          | Superseded by Cycle 2 and Cycle 3        |
| 2     | `api.supabase`, `api.supabase.variables`, `api.supabase.query`                                                                                                                               | 41 files / 134 tests          | 9.84/100%                          | Superseded where overlapping by Cycle 3  |
| 3     | `api.collab.projects`, `api.collab.conversations`, `api.collab.branches`                                                                                                                     | 44 files / 146 tests          | 9.84/100%                          | Superseded where overlapping by Cycle 4  |
| 4     | `api.bug-report`, `api.models.$provider`, `api.llmcall`                                                                                                                                      | 47 files / 154 tests          | 10.39/100%                         | Superseded where overlapping by Cycle 5  |
| 5     | `persistence/localStorage`, `persistence/chats`, `persistence/index`                                                                                                                         | 50 files / 165 tests          | 10.57/100%                         | Superseded where overlapping by Cycle 6  |
| 6     | `persistence/db`                                                                                                                                                                             | 51 files / 170 tests          | 11.05/100%                         | Superseded where overlapping by Cycle 7  |
| 7     | `api.bug-report` edge paths, `api.llmcall` error paths, `api.models.$provider` missing provider                                                                                              | 54 files / 177 tests          | 11.19/100%                         | Superseded where overlapping by Cycle 8  |
| 8     | `utils/projectCommands`, `utils/fileLocks`                                                                                                                                                   | 56 files / 193 tests          | 11.49/100%                         | Superseded where overlapping by Cycle 9  |
| 9     | `utils/buffer`, `utils/promises`, `utils/stacktrace`, `utils/sampler`                                                                                                                        | 60 files / 201 tests          | 11.62/100%                         | Superseded where overlapping by Cycle 10 |
| 10    | `utils/diff`, `utils/fileUtils`, `utils/markdown`, `utils/shell` (`cleanTerminalOutput`)                                                                                                     | 64 files / 217 tests          | 11.89/100%                         | Superseded where overlapping by Cycle 11 |
| 11    | `persistence/lockedFiles` (core, batch, migration, cache) + folder-lock bugfix                                                                                                               | 68 files / 227 tests          | 12.22/100%                         | Superseded where overlapping by Cycle 12 |
| 12    | `utils/diff` edges, `utils/fileUtils` edges, `utils/projectCommands` edges, `utils/shell` edges                                                                                              | 72 files / 240 tests          | 12.29/100%                         | Superseded where overlapping by Cycle 13 |
| 13    | `persistence/db` id+snapshot edges, `utils/markdown` limited, `utils/fileLocks` edges                                                                                                        | 76 files / 250 tests          | 12.3/100%                          | Superseded where overlapping by Cycle 14 |
| 14    | `utils/debounce`, `utils/easings`, `utils/os`, `utils/path`                                                                                                                                  | 80 files / 255 tests          | 12.42/100%                         | Superseded where overlapping by Cycle 15 |
| 15    | `utils/mobile`, `utils/unreachable`, `utils/terminal`, `utils/githubStats`                                                                                                                   | 84 files / 260 tests          | 12.49/100%                         | Superseded where overlapping by Cycle 16 |
| 16    | `utils/gitlabStats.projects`, `utils/gitlabStats.summary`, `utils/react`, `utils/logger`                                                                                                     | 88 files / 265 tests          | 12.57/100%                         | Superseded where overlapping by Cycle 17 |
| 17    | `common/prompts-system` default+cwd+supabase disconnected+unselected                                                                                                                         | 92 files / 269 tests          | 12.60/100%                         | Superseded where overlapping by Cycle 18 |
| 18    | `common/prompts-system` connected+design + `prompts-finetuned` default+cwd                                                                                                                   | 96 files / 273 tests          | 12.64/100%                         | Superseded where overlapping by Cycle 19 |
| 19    | `common/prompts-finetuned` supabase disconnected+unselected+connected+design                                                                                                                 | 100 files / 277 tests         | 12.68/100%                         | Superseded where overlapping by Cycle 20 |
| 20    | `common/prompts-optimized` default+supabase disconnected+unselected+connected                                                                                                                | 104 files / 281 tests         | 12.72/100%                         | Superseded where overlapping by Cycle 21 |
| 21    | `common/prompts-discuss` basic+quick-actions+support+constraints                                                                                                                             | 108 files / 285 tests         | 12.76/100%                         | Superseded where overlapping by Cycle 22 |
| 22    | `utils/constants` core+regex+tool-errors+approvals                                                                                                                                           | 112 files / 289 tests         | 12.79/100%                         | Superseded where overlapping by Cycle 23 |
| 23    | `utils/selectStarterTemplate` success+fallback+untitled + `utils/getTemplates.missing`                                                                                                       | 116 files / 293 tests         | 12.82/100%                         | Superseded where overlapping by Cycle 24 |
| 24    | `utils/getTemplates` basic+fetch-error + `utils/constants` provider-list+default-provider                                                                                                    | 120 files / 297 tests         | 12.84/100%                         | Superseded where overlapping by Cycle 25 |
| 25    | `utils/constants` provider-env-keys+starter-templates+prompt-cookie+provider-env-shape                                                                                                       | 124 files / 301 tests         | 12.85/100%                         | Superseded where overlapping by Cycle 26 |
| 26    | `cycles/prompts-system.response-requirements`, `cycles/prompts-finetuned.artifact-instructions`, `cycles/prompts-optimized.code-formatting`, `cycles/prompts-discuss.quick-actions`          | 128 files / 305 tests         | 12.85/100%                         | Superseded where overlapping by Cycle 27 |
| 27    | `cycles/prompts-system.webcontainer`, `cycles/prompts-finetuned.pexels-guidance`, `cycles/prompts-optimized.chain-of-thought`, `cycles/prompts-discuss.support-resources`                    | 132 files / 309 tests         | 12.85/100%                         | Superseded where overlapping by Cycle 28 |
| 28    | `cycles/prompts-system.database-instructions`, `cycles/prompts-finetuned.identity-anchor`, `cycles/prompts-optimized.artifact-info`, `cycles/prompts-discuss.search-grounding`               | 136 files / 313 tests         | 12.85/100%                         | Superseded where overlapping by Cycle 29 |
| 29    | `cycles/prompts-system.design-instructions`, `cycles/prompts-finetuned.mobile-instructions`, `cycles/prompts-optimized.supabase-js`, `cycles/prompts-discuss.implement-action`               | 140 files / 317 tests         | 12.85/100%                         | Superseded where overlapping by Cycle 30 |
| 30    | `cycles/prompts-system.message-formatting`, `cycles/prompts-finetuned.running-shell-info`, `cycles/prompts-optimized.message-formatting`, `cycles/prompts-discuss.file-action`               | 144 files / 321 tests         | 12.85/100%                         | Superseded where overlapping by Cycle 31 |
| 31    | `cycles/prompts-system.native-binaries`, `cycles/prompts-finetuned.git-unavailable`, `cycles/prompts-optimized.no-pip`, `cycles/prompts-discuss.link-action`                                 | 148 files / 325 tests         | 12.85/100%                         | Superseded where overlapping by Cycle 32 |
| 32    | `cycles/prompts-system.mobile-instructions`, `cycles/prompts-finetuned.mandatory-rules`, `cycles/prompts-optimized.single-artifact`, `cycles/prompts-discuss.message-action`                 | 152 files / 329 tests         | 12.85/100%                         | Superseded where overlapping by Cycle 33 |
| 33    | `cycles/prompts-system.chain-of-thought`, `cycles/prompts-finetuned.final-quality-check`, `cycles/prompts-optimized.system-constraints`, `cycles/prompts-discuss.response-guidelines`        | 156 files / 333 tests         | 12.85/100%                         | Superseded where overlapping by Cycle 34 |
| 34    | `cycles/prompts-system.row-level-security`, `cycles/prompts-finetuned.supabase-cli`, `cycles/prompts-optimized.database-instructions`, `cycles/prompts-discuss.prompt-secrecy`               | 160 files / 337 tests         | 12.85/100%                         | Superseded where overlapping by Cycle 35 |
| 35    | `cycles/prompts-system.shell-commands`, `cycles/prompts-finetuned.technology-preferences`, `cycles/prompts-optimized.migration-guideline`, `cycles/prompts-discuss.no-code-snippets`         | 164 files / 341 tests         | 12.85/100%                         | Superseded where overlapping by Cycle 36 |
| 36    | `cycles/prompts-system.migration-operation`, `cycles/prompts-finetuned.database-anchor`, `cycles/prompts-optimized.vite-preference`, `cycles/prompts-discuss.single-plan`                    | 168 files / 345 tests         | 12.85/100%                         | Superseded where overlapping by Cycle 37 |
| 37    | `cycles/prompts-system.query-operation`, `cycles/prompts-finetuned.bolt-identity`, `cycles/prompts-optimized.transaction-control`, `cycles/prompts-discuss.no-implement-phrasing`            | 172 files / 349 tests         | 12.85/100%                         | Superseded where overlapping by Cycle 38 |
| 38    | `cycles/prompts-system.artifact-info`, `cycles/prompts-finetuned.rls-anchor`, `cycles/prompts-optimized.if-exists-safety`, `cycles/prompts-discuss.always-actions`                           | 176 files / 353 tests         | 12.85/100%                         | Superseded where overlapping by Cycle 39 |
| 39    | `cycles/prompts-system.shell-action-reference`, `cycles/prompts-finetuned.action-types-anchor`, `cycles/prompts-optimized.markdown-only`, `cycles/prompts-discuss.concise-button-text`       | 180 files / 357 tests         | 12.85/100%                         | Superseded where overlapping by Cycle 40 |
| 40    | `cycles/prompts-system.action-types`, `cycles/prompts-finetuned.system-constraints-anchor`, `cycles/prompts-optimized.no-artifact-word`, `cycles/prompts-discuss.project-files`              | 184 files / 361 tests         | 12.85/100%                         | Superseded where overlapping by Cycle 41 |
| 41    | `cycles/services.github-api-service`, `cycles/services.gitlab-api-service`, `cycles/services.import-export-service`, `cycles/services.local-model-health-monitor`                            | 193 files / 370 tests         | 14.12/100%                         | Superseded where overlapping by Cycle 42 |
| 42    | `cycles/services.mcp-service`, `cycles/api.connection-client`, `cycles/api.cookies-storage`, `cycles/api.debug-flags`                                                                        | 197 files / 374 tests         | 14.12/100%                         | Superseded where overlapping by Cycle 43 |
| 43    | `cycles/api.features-config`, `cycles/api.notifications-client`, `cycles/api.updates-client`, `cycles/llm.base-provider`                                                                     | 201 files / 378 tests         | 14.12/100%                         | Superseded where overlapping by Cycle 44 |
| 44    | `cycles/llm.manager`, `cycles/llm.registry`, `cycles/llm.types-contract`, `cycles/runtime.action-runner`                                                                                     | 205 files / 382 tests         | 14.12/100%                         | Superseded where overlapping by Cycle 45 |
| 45    | `cycles/runtime.enhanced-message-parser`, `cycles/providers.amazon-bedrock`, `cycles/providers.anthropic`, `cycles/providers.cerebras`                                                       | 209 files / 386 tests         | 14.12/100%                         | Superseded where overlapping by Cycle 46 |
| 46    | `cycles/providers.cohere`, `cycles/providers.deepseek`, `cycles/providers.fireworks`, `cycles/providers.github`                                                                              | 213 files / 390 tests         | 14.12/100%                         | Superseded where overlapping by Cycle 47 |
| 47    | `cycles/providers.google`, `cycles/providers.groq`, `cycles/providers.huggingface`, `cycles/providers.hyperbolic`                                                                            | 217 files / 394 tests         | 14.12/100%                         | Superseded where overlapping by Cycle 48 |
| 48    | `cycles/providers.lmstudio`, `cycles/providers.mistral`, `cycles/providers.moonshot`, `cycles/providers.ollama`                                                                              | 221 files / 398 tests         | 14.12/100%                         | Superseded where overlapping by Cycle 49 |
| 49    | `cycles/providers.open-router`, `cycles/providers.openai-like`, `cycles/providers.openai`, `cycles/providers.perplexity`                                                                     | 225 files / 402 tests         | 14.12/100%                         | Superseded where overlapping by Cycle 50 |
| 50    | `cycles/providers.together`, `cycles/providers.xai`, `cycles/providers.z-ai`, `cycles/stores.chat-state`                                                                                     | 229 files / 406 tests         | 14.12/100%                         | Superseded where overlapping by Cycle 51 |
| 51    | `cycles/stores.editor-state`, `cycles/stores.files-state`, `cycles/stores.github-state`, `cycles/stores.github-connection-state`                                                             | 233 files / 410 tests         | 14.12/100%                         | Superseded where overlapping by Cycle 52 |
| 52    | `cycles/stores.gitlab-connection-state`, `cycles/stores.logs-state`, `cycles/stores.mcp-state`, `cycles/stores.netlify-state`                                                                | 237 files / 414 tests         | 14.12/100%                         | Superseded where overlapping by Cycle 53 |
| 53    | `cycles/stores.previews-state`, `cycles/stores.profile-state`, `cycles/stores.qr-code-state`, `cycles/stores.settings-state`                                                                 | 241 files / 418 tests         | 14.12/100%                         | Superseded where overlapping by Cycle 54 |
| 54    | `cycles/stores.streaming-state`, `cycles/stores.supabase-state`, `cycles/stores.tab-configuration-state`, `cycles/stores.terminal-state`                                                     | 245 files / 422 tests         | 14.12/100%                         | Superseded where overlapping by Cycle 55 |
| 55    | `cycles/stores.theme-state`, `cycles/stores.vercel-state`, `cycles/stores.workbench-state`, `cycles/hooks.index-exports`                                                                     | 249 files / 426 tests         | 14.12/100%                         | Superseded where overlapping by Cycle 56 |
| 56    | `cycles/hooks.connection-status`, `cycles/hooks.connection-test`, `cycles/hooks.data-operations`, `cycles/hooks.edit-chat-description`                                                       | 253 files / 430 tests         | 14.12/100%                         | Superseded where overlapping by Cycle 57 |
| 57    | `cycles/hooks.features`, `cycles/hooks.git`, `cycles/hooks.github-api`, `cycles/hooks.github-connection`                                                                                     | 257 files / 434 tests         | 14.12/100%                         | Superseded where overlapping by Cycle 58 |
| 58    | `cycles/hooks.github-stats`, `cycles/hooks.gitlab-api`, `cycles/hooks.gitlab-connection`, `cycles/hooks.indexed-db`                                                                          | 261 files / 438 tests         | 14.12/100%                         | Superseded where overlapping by Cycle 59 |
| 59    | `cycles/hooks.local-model-health`, `cycles/hooks.local-providers`, `cycles/hooks.message-parser`, `cycles/hooks.notifications`                                                               | 265 files / 442 tests         | 14.12/100%                         | Superseded where overlapping by Cycle 60 |
| 60    | `cycles/hooks.prompt-enhancer`, `cycles/hooks.search-filter`, `cycles/hooks.settings`, `cycles/hooks.supabase-connection`                                                                    | 269 files / 446 tests         | 14.12/100%                         | **Current authoritative state**          |
| 61    | `services/openclaw-client`, `platform/rate-limit`, `platform/authz`, `platform/schema-version`, `core/model-router`, `core/chat-engine`, `routes/api.metrics`                                | 280 files / 477 tests         | 14.12/100%                         | Superseded where overlapping by Cycle 62 |
| 62    | `architecture/layer-structure`, `infrastructure/config-loader`, `infrastructure/db-router`, `infrastructure/migration-engine`, `platform/jwt`, `infrastructure/encryption`, `integrations/*` | 290 files / 503 tests         | 14.12/100%                         | **Current authoritative state**          |

Effective current state after conflict resolution (newest wins):

- Unit tests: **290 files / 503 tests**
- Coverage single score: **14.12/100%**
- Coverage detail: Statements **14.12%**, Lines **14.12%**, Functions **34.66%**, Branches **61.73%**

| Milestone | Target (global statements) | Scope focus                                                |
| --------- | -------------------------: | ---------------------------------------------------------- |
| M1        |                       30%+ | Core utils + auth/system routes + persistence entry points |
| M2        |                       45%+ | Remaining API routes + key stores/hooks                    |
| M3        |                       60%+ | LLM modules + persistence internals + service layers       |
| M4        |                       75%+ | Critical UI logic/components + workbench core logic        |
| M5        |                       90%+ | Electron + scripts + long-tail utilities                   |
| M6        |                       100% | All remaining files and branches                           |

### Milestone progress

- Current milestone status: **Pre-M1** (14.12% / 30% target)
- Remaining to M1: **15.88 percentage points**

### Next batches (execution priority)

Requested priority is to maximize M1/M2 speed first, then continue in this order: **M3 -> M5 -> M4**.

1. Route handlers (`api.*`) batch expansion (highest immediate M1/M2 impact).
2. Utility and store modules with low-hanging branch gaps.
3. Persistence internals (`sqlite-memory`, `postgrest-memory`) via mocking/integration-style unit tests (M3 acceleration).
4. Electron/scripts long-tail modules (M5 acceleration).
5. Component logic and workbench modules (M4 focus after M5).

### How progress is tracked

- Run `pnpm exec vitest --run --coverage` after each batch.
- Update this file with covered modules and remaining gaps.
- Keep CI green on:
  - `pnpm run test:unit`
  - `pnpm run test:unit:changed`

## Test placement policy

For each new or changed source file under `app/`:

1. Prefer colocated test: `file.test.ts` / `file.spec.ts`, or
2. Mirror path under `unit-tests/`.

Examples:

- `app/routes/api.persistence.ts` -> `unit-tests/routes/api.persistence.test.ts`
- `app/lib/stores/collab.ts` -> `unit-tests/stores/collab-store.test.ts`

## Merge policy recommendation

For your fork, require CI checks to pass before merge:

- Unit tests pass
- Changed files test mapping passes
