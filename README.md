# bolt2.dyi

bolt2.dyi is a structured and modular fork of the original [bolt.diy](https://github.com/stackblitz-labs/bolt.diy) project.

This fork preserves the familiar user experience while refactoring the internal architecture into a clean, layered, and extensible AI platform model.

The objective is clarity, maintainability, and controlled evolution.

---

## Project Purpose

bolt2.dyi evolves bolt.diy from:

> A single-user AI chat tool

into:

> A layered AI platform with optional external integrations and controlled fallback architecture.

Design principles:

- Clear separation of concerns
- Optional external integrations (never bundled)
- SQLite default fallback
- External PostgreSQL support
- Connector-based integration model
- Graceful degradation
- Structured documentation
- No hidden infrastructure assumptions

<img width="1400" height="883" alt="Bolt2-main" src="https://github.com/user-attachments/assets/6a7e51de-8982-4594-889e-f67d7d4f7317" />


<img width="2462" height="1172" alt="image" src="https://github.com/user-attachments/assets/76af0720-a629-4fba-b6ed-86d02c1b7bdf" />


---

## Architecture Overview

The system follows a layered dependency model:

ui → platform → core → integrations → infrastructure

Each layer has a strict responsibility:

### `/core`

- Chat engine
- Streaming logic
- LLM abstraction
- Model routing
- Tool invocation contracts

### `/platform`

- Authentication (JWT)
- Role-based access control (RBAC)
- User management
- Prompt management (versioned)
- Provider configuration
- Audit logging
- Rate limiting
- Input validation

### `/integrations`

- SQLite adapter
- PostgreSQL adapter (external)
- PostgREST client (external)
- OpenClaw connector (external)
- MCP adapter

### `/infrastructure`

- Database abstraction layer
- Migration engine
- Schema versioning
- Logging
- Encryption utilities
- Configuration loading

### `/ui`

- React frontend
- Admin interface
- Settings and provider management

### `/docs`

- Structured documentation hierarchy

No database logic inside UI.  
No integration logic inside UI.  
No circular dependencies.

---

## Directory Structure

/core
/platform
/integrations
/infrastructure
/ui
/extensions
/docs

Only the following files exist at root level:

- README.md
- CHANGELOG.md
- LICENSE.md

All other documentation lives under `/docs`.

---

## Database Modes

bolt2.dyi supports two database modes.

### Default Mode – SQLite

- Embedded
- No external dependency
- Suitable for single-user setup
- Automatic startup

### Optional Mode – External PostgreSQL

- Configured via environment variables
- Not bundled
- Requires external service

### Optional PostgREST

- External endpoint
- Used only if configured
- Not required

Behavior:

- If PostgreSQL is not configured → SQLite is used.
- If PostgreSQL connection fails → error is logged and fallback applies (if allowed).
- System must never crash due to missing optional integrations.

See documentation:

- `/docs/database/sqlite.md`
- `/docs/database/postgresql.md`
- `/docs/database/postgrest.md`
- `/docs/database/migrations.md`

---

## Optional Integrations

bolt2.dyi does not bundle infrastructure services.

### OpenClaw

- External instance only
- Connector-based
- Capability detection at startup
- Graceful degradation if unavailable
- No system crash if not configured

Documentation:
`/docs/integrations/openclaw.md`

### MCP (Model Context Protocol)

- Modular adapter
- Context scoped per request
- No global mutable context
- Logged lifecycle

Documentation:
`/docs/integrations/mcp.md`

### n8n

- External n8n instance only (not bundled)
- API key + base URL configuration required
- Supports workflow deployment through the n8n integration route
- Can be configured from system settings when environment variables are not set
- Graceful failure if n8n is not configured or unavailable

Current integration endpoint:
`/api/n8n/workflows`

---

## Security Model

bolt2.dyi implements:

- JWT authentication
- Role-based access control (Admin / User roles)
- Encrypted API key storage
- Encrypted integration credentials
- Structured request logging with request IDs
- Centralized error handling
- Input validation
- Graceful failure handling

Security documentation:

- `/docs/security/authentication.md`
- `/docs/security/rbac.md`
- `/docs/security/encryption.md`
- `/docs/security/audit-logging.md`

---

## Setup

### Docker

The docker setup includes the core application only.

It does not bundle:

- PostgreSQL
- PostgREST
- OpenClaw

See:

- `/docs/setup/docker/development.md`
- `/docs/setup/docker/production.md`
- `/docs/setup/docker/external-postgres.md`
- `/docs/setup/docker/external-openclaw.md`

### Single Host Installation

Supported environments:

- Windows
- Linux
- macOS

See:

- `/docs/setup/single-host/windows.md`
- `/docs/setup/single-host/linux.md`
- `/docs/setup/single-host/osx.md`

---

## Development Guidelines

Development documentation:

- `/docs/development/local-dev.md`
- `/docs/development/testing.md`
- `/docs/development/migration-guide.md`

Key rules:

- No direct integration calls from UI
- No hardcoded credentials
- No circular dependencies
- Test-first change rule is mandatory (verify/create tests before production code changes)
- All changes must pass test suite
- Refactors must not introduce regressions

---

## Testing

Testing requirements:

- Existing tests must pass
- Refactors must not break functionality
- Optional integrations must support mocked tests
- Migration logic must be tested
- Coverage should increase over time

Testing documentation:
`/docs/development/testing.md`

---

## Operations

Operational documentation:

- `/docs/operations/deployment.md`
- `/docs/operations/environment-variables.md`
- `/docs/operations/health-monitoring.md`
- `/docs/operations/troubleshooting.md`

Health endpoint:
`/api/health`

---

## Documentation Map

All structured documentation is located under:

/docs

Sections:

- Setup → `/docs/setup`
- Database → `/docs/database`
- Integrations → `/docs/integrations`
- Architecture → `/docs/architecture`
- Security → `/docs/security`
- API → `/docs/api`
- Development → `/docs/development`
- Operations → `/docs/operations`

---

## Status

bolt2.dyi is an actively evolving structured fork.

The focus is on architectural clarity, controlled growth, and professional project layout rather than rapid feature expansion.

---

## Attribution

bolt2.dyi is based on the original bolt.diy project.

This fork restructures and extends the architecture while preserving core functionality.
