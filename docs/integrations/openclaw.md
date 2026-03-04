# OpenClaw Integration

OpenClaw is optional and external.

## Connector

- `app/integrations/openclaw/client.ts`
- `app/lib/.server/extensions/openclaw/openclaw-client.ts`

## Env

- `OPENCLAW_BASE_URL`
- `OPENCLAW_TIMEOUT_MS`
- `OPENCLAW_ALLOWED_TOOLS`

## Safety

- Timeout handling
- Tool allowlist checks
- Audit logging
- Graceful disable when unavailable
