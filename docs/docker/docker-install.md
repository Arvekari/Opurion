# Docker Install Guide

This guide covers Docker installation prerequisites for running `Bolt2.dyi` with the Docker stack.

## Windows (Docker Desktop)

1. Install Docker Desktop:
   - https://www.docker.com/products/docker-desktop/
2. During setup, enable WSL2 integration when prompted.
3. Restart Windows if required by installer.
4. Open Docker Desktop and wait for the engine to show as running.

### Verify installation (PowerShell)

```powershell
docker --version
docker compose version
docker info
```

If `docker info` fails, Docker engine is not running yet.

## Linux

Install Docker Engine and Docker Compose plugin for your distro (Ubuntu/Debian/Fedora/etc.) using official docs:

- https://docs.docker.com/engine/install/
- https://docs.docker.com/compose/install/linux/

### Verify installation

```bash
docker --version
docker compose version
docker info
```

## macOS

1. Install Docker Desktop for Mac:
   - https://www.docker.com/products/docker-desktop/
2. Start Docker Desktop.
3. Wait until Docker engine is running.

### Verify installation

```bash
docker --version
docker compose version
docker info
```

## Required project files

For this repo Docker workflow, use:

- [docs/docker/composed/Dockerfile](docs/docker/composed/Dockerfile)
- [docs/docker/composed/docker-compose.yaml](docs/docker/composed/docker-compose.yaml)
- [docs/docker/composed/portainer-stack.example.yml](docs/docker/composed/portainer-stack.example.yml)
- [docs/docker/composed/README.md](docs/docker/composed/README.md)

## Common issues

- Docker command works but build fails with engine pipe error:
  - Start Docker Desktop and re-run the command.
- Compose fails because env file is missing:
  - This project compose file uses optional env file loading; check your `.env.production` or stack env values.
- Cannot pull private GHCR image:
  - Add registry credentials in Portainer (`ghcr.io`, GitHub PAT with `read:packages`).
