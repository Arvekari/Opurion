# Docker Production

Use application-only compose profiles/files.

## Commands

- `docker compose -f docs/setup/docker/runtime/docker-compose.yaml --profile production up --build`
- `docker compose -f docs/setup/docker/runtime/docker-compose.production.yaml up -d --build`

## Rules

- No bundled PostgreSQL container
- No bundled PostgREST container
- No bundled OpenClaw container
