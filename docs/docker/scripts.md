# Docker Scripts / Commands

This page collects the Docker commands used for local build, registry push, and Portainer deployment.

## Local build and run (from repo root)

Build production image:

```bash
docker compose -f docs/docker/composed/docker-compose.yaml build ebolt2
```

Run production service:

```bash
docker compose -f docs/docker/composed/docker-compose.yaml up -d ebolt2
```

Run development service:

```bash
docker compose -f docs/docker/composed/docker-compose.yaml --profile development up --build ebolt2-dev
```

## Push image to GitHub Container Registry

```bash
docker tag bolt2-dyi:latest ghcr.io/<your-org>/ebolt2:latest
docker push ghcr.io/<your-org>/ebolt2:latest
```

## Deploy prebuilt image with compose

```bash
IMAGE_NAME=ghcr.io/<your-org>/ebolt2 IMAGE_TAG=latest docker compose -f docs/docker/composed/docker-compose.yaml up -d --no-build ebolt2
```

## Portainer stack deployment

Use stack template:

- [docs/docker/composed/portainer-stack.example.yml](docs/docker/composed/portainer-stack.example.yml)

Steps:

1. Open Portainer -> Stacks -> Add stack.
2. Paste stack YAML.
3. Replace image with your GHCR path.
4. Set environment values.
5. Deploy stack.

## Related docs

- [docs/docker/docker-install.md](docs/docker/docker-install.md)
- [docs/docker/stack.md](docs/docker/stack.md)
- [docs/docker/composed/README.md](docs/docker/composed/README.md)
