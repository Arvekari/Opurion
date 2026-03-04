# External OpenClaw

OpenClaw is optional and external.

## Required env

- `OPENCLAW_BASE_URL=http://...`

## Optional env

- `OPENCLAW_TIMEOUT_MS=30000`
- `OPENCLAW_ALLOWED_TOOLS=terminal.exec,git.status`

## Degrade behavior

- If not configured or unavailable, OpenClaw features are disabled gracefully.
- Core chat/runtime remains operational.
