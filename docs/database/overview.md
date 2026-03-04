# DATABASE

## Modes

### Default

- SQLite embedded mode
- Single-host, local persistence
- Configurable path (`BOLT_SQLITE_PERSISTENCE_PATH`)

### Optional external

- PostgreSQL via PostgREST endpoint
- No DB service bundled in this repository

## Runtime selection

Configuration key:

- `BOLT_SERVER_DB_PROVIDER`
  - `sqlite` -> SQLite mode
  - `postgrest` or `postgres` -> external PostgREST mode

Fallback key:

- `BOLT_DB_FALLBACK_TO_SQLITE=true|false` (default `true`)

Graceful degradation:

- Unreachable PostgREST with fallback enabled -> SQLite fallback
- Unreachable PostgREST with fallback disabled -> degraded external mode (no crash)

## Schema and versioning

- SQLite startup initializes and updates schema metadata table: `schema_meta`
- Current schema version value is defined in: `app/platform/persistence/schema-version.ts`
- Migration planning helper is in: `app/infrastructure/migrations/engine.ts`

## External schema

Apply and maintain PostgREST schema in:

- `docs/postgrest-schema.sql`

Includes parity for persisted entities such as:

- `agent_runs`
- collaboration tables
- auth/session/persistence tables
