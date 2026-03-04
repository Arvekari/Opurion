# SECURITY

## Authentication

- Local auth endpoints remain active.
- JWT utilities are available in `app/platform/security/jwt.ts`.
- Session cookies are still supported for compatibility.

## Authorization

- Role model: `admin`, `user`
- RBAC helper modules:
  - `app/platform/security/authz.ts`
  - `app/platform/security/require-role.ts`

## Rate limiting

- Configurable per-minute API rate limiting baseline in:
  - `app/platform/security/rate-limit.ts`
  - `app/platform/security/request-guard.ts`
- Applied to auth routes as baseline guard.

## Request tracing and error handling

- Request ID generation and API logging:
  - `app/platform/http/request-context.ts`
- Centralized error response utility:
  - `app/platform/http/error-handler.ts`

## Secrets and encryption

- Secret encryption utility (AES-GCM):
  - `app/infrastructure/encryption/secret-box.ts`
- Intended for encrypted-at-rest secret values (API keys/tool credentials integration path).

## OpenClaw safety

- Optional connector only (no bundling).
- Timeout handling and failure isolation.
- Tool allowlist control via `OPENCLAW_ALLOWED_TOOLS`.
- Audit logging of blocked/processed tool actions.
