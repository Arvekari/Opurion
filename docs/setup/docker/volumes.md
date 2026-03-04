# Docker Volumes

## Required volumes

- `/data` for SQLite persistence
- `/logs` for structured log storage target

## Example

In `docs/setup/docker/runtime/docker-compose.production.yaml`:

- `bolt_data:/data`
- `bolt_logs:/logs`
