# External PostgreSQL / PostgREST

This project connects to existing external services only.

## Required env

- `BOLT_SERVER_DB_PROVIDER=postgrest` (or `postgres` alias)
- `POSTGREST_URL=http://...`
- `POSTGREST_SERVICE_ROLE_KEY=...` (recommended)

## Fallback behavior

- If external endpoint is unreachable and `BOLT_DB_FALLBACK_TO_SQLITE=true`, runtime degrades to SQLite.
- If fallback is disabled, runtime remains in degraded external mode without crash.
