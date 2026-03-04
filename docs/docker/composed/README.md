# ebolt2 Docker package

This directory contains a self-contained Docker packaging setup for `bolt2.dyi`.

## Files

- `Dockerfile` - multi-stage build with `bolt2-dyi-production` and `development` targets
- `docker-compose.yaml` - production service (`ebolt2`) and optional dev service (`ebolt2-dev`)

## Build image (from repository root)

```bash
docker compose -f docs/docker/composed/docker-compose.yaml build ebolt2
```

## Run production container locally

```bash
docker compose -f docs/docker/composed/docker-compose.yaml up -d ebolt2
```

## Run development profile (optional)

```bash
docker compose -f docs/docker/composed/docker-compose.yaml --profile development up --build ebolt2-dev
```

## Tag and push image to registry

Replace values as needed:

```bash
docker tag bolt2-dyi:latest ghcr.io/<your-org>/ebolt2:latest
docker push ghcr.io/<your-org>/ebolt2:latest
```

## Deploy using prebuilt image

Set runtime image values and start:

```bash
IMAGE_NAME=ghcr.io/<your-org>/ebolt2 IMAGE_TAG=latest docker compose -f docs/docker/composed/docker-compose.yaml up -d --no-build ebolt2
```

## Portainer stack example (deploy from GitHub image)

Use [portainer-stack.example.yml](portainer-stack.example.yml) as your stack template.

1. Push your image to GitHub Container Registry:

```bash
docker tag bolt2-dyi:latest ghcr.io/<your-org>/ebolt2:latest
docker push ghcr.io/<your-org>/ebolt2:latest
```

2. In Portainer, go to **Stacks** -> **Add stack**.
3. Paste the contents of `portainer-stack.example.yml`.
4. Replace `ghcr.io/your-org/ebolt2:latest` with your real image name.
5. Fill API key environment values before deploy.
6. Deploy the stack.

If your GHCR image is private, add Portainer registry credentials for `ghcr.io` (GitHub username + PAT with `read:packages`).

## Notes

- Default persistence is SQLite (`/data/bolt-memory.sqlite`).
- PostgreSQL, PostgREST, and OpenClaw are external and optional.
- Runtime secrets should come from `../../../.env.local` or environment variables in your deployment platform.
