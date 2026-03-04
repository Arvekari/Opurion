# Docker Development

Use only application containers. Do not bundle PostgreSQL, PostgREST, or OpenClaw.

## Command

- `docker compose -f docs/setup/docker/runtime/docker-compose.yaml --profile development up --build`

## Notes

- Source is bind-mounted for iterative development.
- Default DB mode stays SQLite unless external mode is explicitly configured.
