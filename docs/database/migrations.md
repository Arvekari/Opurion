# Migrations

Migration planning exists in infrastructure layer:

- `app/infrastructure/migrations/engine.ts`
- `app/platform/persistence/schema-version.ts`

SQLite startup stores schema metadata in `schema_meta`.

## Engine parity

Migration planning supports both:

- SQLite
- PostgREST-backed external persistence mode
