# SQLite (Default)

SQLite remains the default persistence backend.

## Env

- `BOLT_SQLITE_PERSISTENCE_ENABLED=true`
- `BOLT_SQLITE_PERSISTENCE_PATH=/data/bolt-memory.sqlite` (recommended in Docker)

## Notes

- Used automatically when external backend is not configured.
- Can also be used as graceful fallback from unreachable external backend.
