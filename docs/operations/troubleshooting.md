# Troubleshooting

## PostgREST unreachable

- verify `POSTGREST_URL`
- verify network access
- check fallback behavior via `/api/health`

## OpenClaw unavailable

- verify `OPENCLAW_BASE_URL`
- check timeout (`OPENCLAW_TIMEOUT_MS`)
- check allowlist (`OPENCLAW_ALLOWED_TOOLS`)

## General

- run `pnpm run test:unit`
- review request/audit logs
