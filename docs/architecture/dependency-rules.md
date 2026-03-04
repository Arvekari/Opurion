# Dependency Rules

- UI depends on platform/core APIs, not on persistence internals.
- Core must not depend on UI.
- Integrations encapsulate external service calls.
- Infrastructure provides shared runtime utilities.
- Platform composes security, persistence policy, and operational behavior.

Enforce changes through tests before and after refactors.
