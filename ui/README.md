# UI Layer

This folder marks the UI layer boundary for platform architecture.

Rules:

- UI components render state and dispatch actions.
- No provider logic in UI.
- No persistence logic in UI.
- Business logic is delegated to `core`, `platform`, or `extensions` modules.
