# PostgREST (External)

PostgREST is not bundled in this repository.

## Required env

- `POSTGREST_URL`
- `POSTGREST_SERVICE_ROLE_KEY` (recommended)

## Schema

Apply schema from `docs/postgrest-schema.sql` on external PostgreSQL.

## Runtime behavior

- Reachable endpoint: active external persistence path.
- Unreachable endpoint: graceful fallback or degraded external mode depending on `BOLT_DB_FALLBACK_TO_SQLITE`.
