# INSTALL

## Single-host (Node)

1. Install dependencies:
   - `pnpm install`
2. Configure runtime:
   - copy `.env.example` to `.env.local`
   - set at least provider keys you use
   - optional external integrations:
     - `BOLT_SERVER_DB_PROVIDER=postgrest` + `POSTGREST_URL=...`
     - `OPENCLAW_BASE_URL=...`
3. Enable persistent SQLite (default backend):
   - `BOLT_SQLITE_PERSISTENCE_ENABLED=true`
   - `BOLT_SQLITE_PERSISTENCE_PATH=.bolt-memory.sqlite`
4. Start app:
   - `pnpm run dev`

## Docker (single host)

1. Build and run production profile:
   - `docker compose --profile production up --build`
2. Persistent volumes:
   - `bolt_data` -> `/data` (SQLite DB)
   - `bolt_logs` -> `/logs` (structured logs)
3. Recommended env:
   - `BOLT_SQLITE_PERSISTENCE_ENABLED=true`
   - `BOLT_SQLITE_PERSISTENCE_PATH=/data/bolt-memory.sqlite`
   - `BOLT_LOG_DIR=/logs`
   - `BOLT_DB_FALLBACK_TO_SQLITE=true`
   - `OPENCLAW_TIMEOUT_MS=30000`

## Graceful fallback

- If external PostgREST is unavailable and fallback is enabled, runtime degrades to SQLite.
- If OpenClaw is unavailable, OpenClaw features disable gracefully and the app remains functional.

## Docker (production compose)

Use dedicated file:

- `docker compose -f docs/setup/docker/runtime/docker-compose.production.yaml up -d --build`

The production compose is configured for:

- persistent DB and logs volumes
- env-file driven config
- production-safe defaults (`NODE_ENV=production`, no bind mounts)
