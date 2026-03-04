# Docker Stack Guide

This document explains the Portainer stack script used to deploy `ebolt2` from a prebuilt container image.

## Stack file

Use:

- [docker/composed/portainer-stack.example.yml](composed/portainer-stack.example.yml)

The file is designed to run the app in production mode with:

- image from GitHub Container Registry (GHCR)
- SQLite persistence volume (`/data`)
- logs volume (`/logs`)
- optional external integrations (PostgREST, OpenClaw)

## Service overview

The stack defines one service:

- `ebolt2`
  - `image`: `ghcr.io/your-org/ebolt2:latest` (replace with your real image)
  - `ports`: `5173:5173`
  - `restart`: `unless-stopped`
  - `command`: `NODE_OPTIONS=--conditions=browser PORT=5173 HOST=0.0.0.0 pnpm exec remix-serve build/server/index.js`
  - `healthcheck`: probes `http://localhost:5173/`

## Volumes

Named volumes created by the stack:

- `ebolt2_data` -> `/data`
- `ebolt2_logs` -> `/logs`

These keep data and logs across container restarts/upgrades.

## Required edits before deploy

In the stack YAML, update:

1. `image` to your published GHCR image.
2. API key environment values you want enabled.
3. Optional integration endpoints:
   - `POSTGREST_URL`
   - `POSTGREST_SERVICE_ROLE_KEY`
   - `OPENCLAW_BASE_URL`

If you want only local SQLite mode, keep:

- `BOLT_SERVER_DB_PROVIDER=sqlite`
- `BOLT_SQLITE_PERSISTENCE_ENABLED=true`

## Deploy in Portainer

1. Open Portainer.
2. Go to **Stacks** -> **Add stack**.
3. Name the stack (example: `ebolt2`).
4. Paste the contents of [docker/composed/portainer-stack.example.yml](composed/portainer-stack.example.yml).
5. Replace image + environment values.
6. Click **Deploy the stack**.

## Private GHCR images

If the image is private:

1. In Portainer, add a registry credential for `ghcr.io`.
2. Use your GitHub username and a PAT with `read:packages`.
3. Re-deploy or update the stack.

## Updating to a new image version

After pushing a new tag (for example `v1.0.1`):

1. Change `image` in the stack to that tag.
2. Click **Update the stack** in Portainer.
3. Confirm container starts healthy.

## Related files

- [docker/composed/Dockerfile](composed/Dockerfile)
- [docker/composed/docker-compose.yaml](composed/docker-compose.yaml)
- [docker/composed/README.md](composed/README.md)
- [setup/docker/production.md](../setup/docker/production.md)
