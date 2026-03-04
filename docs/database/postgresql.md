# PostgreSQL (External)

PostgreSQL is not bundled in this repository.

Use an existing external PostgreSQL instance together with PostgREST.

## Configuration

- `BOLT_SERVER_DB_PROVIDER=postgrest` or `postgres`
- `POSTGREST_URL=http://...`

## Failure behavior

- If external mode is unreachable and fallback is enabled, runtime degrades to SQLite.
