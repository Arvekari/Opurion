# Layering

Reference structure:

- `/core`: chat, streaming, routing, contracts
- `/platform`: auth, rbac, users, prompts, providers, audit
- `/integrations`: postgres, postgrest, sqlite, openclaw, mcp
- `/infrastructure`: database, migrations, config, logging, encryption
- `/ui`: components, pages, admin, settings

Rule: no UI business logic, no direct frontend tool execution.
