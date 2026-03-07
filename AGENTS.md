# AGENTS.md

## Safe autonomous operations

The agent may freely:

- create and update files under `bolt.work/**`
- create and update files under `docs/**`
- create and update files under `unit-tests/**`
- update existing source files under `app/**` and `ui/**` when directly related to the active task
- run routine non-destructive commands (`pnpm`, `node`, `npm`, `pwsh`/`powershell`) for build/test/validation

## Approval required

The agent must ask before:

- deleting files or directories
- modifying `.env*` files
- modifying secrets, credentials, tokens, or auth configuration
- changing CI/CD or release pipelines
- running destructive git commands (`git reset --hard`, force push, history rewrite)
- modifying lockfiles unless the task explicitly requires dependency changes

## Guardrails

- Keep edits scoped to the active task; avoid unrelated refactors.
- Prefer workspace-local outputs under `bolt.work/**` for runtime/temporary artifacts.
- If a command can be non-destructive but broad, use the smallest safe scope first.
