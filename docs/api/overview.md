# API

## Health & Metrics

- `GET /api/health`
  - Returns status, request id, timestamp, startup checks.
  - Includes active DB provider, fallback/degraded state, OpenClaw enabled/disabled status.
- `GET /api/metrics`
  - Returns basic runtime metrics (`uptimeSeconds`, timestamp) with request id.

## Auth

- `POST /api/auth/signup`
  - Creates local user, first user becomes admin.
  - Includes request-id and rate-limit guard.
- `POST /api/auth/login`
  - Validates credentials and sets auth cookies.
  - Includes request-id and rate-limit guard.
- `GET /api/auth/session`
  - Returns session state and active user.
- `POST /api/auth/logout`
  - Clears auth session cookie.

## Agent Runs

- `GET /api/agent-runs`
  - Lists persisted runs.
- `GET /api/agent-runs?runId=<id>`
  - Returns a persisted run by id.
  - For OpenClaw runs, includes best-effort remote status sync.
- `POST /api/agent-runs`
  - `intent=start`: starts run (`llm|openclaw|workflow`).
  - `intent=cancel`: cancels local run and best-effort remote OpenClaw run cancellation.

## Notes

- OpenClaw integration uses `OPENCLAW_BASE_URL`.
- OpenClaw tool permissions are controlled by `OPENCLAW_ALLOWED_TOOLS`.
- DB provider is selected with `BOLT_SERVER_DB_PROVIDER` (`sqlite` or `postgrest`).
- `BOLT_SERVER_DB_PROVIDER=postgres` is accepted as alias to `postgrest` mode.
- Graceful fallback is controlled with `BOLT_DB_FALLBACK_TO_SQLITE`.
- External PostgREST schema is maintained in `docs/postgrest-schema.sql`.
