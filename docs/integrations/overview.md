# INTEGRATIONS

This project does not bundle external services. Integrations are connector-based and optional.

## External service policy

Not bundled by this repository:

- PostgreSQL
- PostgREST
- OpenClaw

The app connects to them only when configured.

## PostgreSQL + PostgREST

### Required env (for external mode)

- `BOLT_SERVER_DB_PROVIDER=postgrest` (or `postgres` alias)
- `POSTGREST_URL=http://your-postgrest-host:3000`
- `POSTGREST_SERVICE_ROLE_KEY=...` (optional but recommended)

### Behavior

- If configured and reachable: uses external PostgREST backend.
- If configured but unreachable:
  - with `BOLT_DB_FALLBACK_TO_SQLITE=true` (default) -> degrades to SQLite.
  - with `BOLT_DB_FALLBACK_TO_SQLITE=false` -> remains in degraded PostgREST mode.
- Never starts bundled PostgreSQL/PostgREST containers.

## OpenClaw

### Required env

- `OPENCLAW_BASE_URL=http://your-openclaw-host:PORT`

### Optional env

- `OPENCLAW_TIMEOUT_MS=30000`
- `OPENCLAW_ALLOWED_TOOLS=terminal.exec,git.status,...`

### Behavior

- If not configured: feature is disabled, system remains fully functional.
- If configured: connector is enabled, with timeout/error isolation.
- Tool calls can be restricted via allowlist.
- Tool actions are audit-logged.

## MCP

MCP is integrated via adapter layer (`app/integrations/mcp/adapter.ts`) and stays out of UI/business presentation.

Behavior:

- Request-scoped processing lifecycle
- Audit logging
- Errors isolated per request
