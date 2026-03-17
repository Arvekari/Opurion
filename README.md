<img width="1183" height="421" alt="Opurion" src="https://github.com/user-attachments/assets/542f7c90-1003-45ef-852d-75fff8c2f1fa" />

**Opurion** is a structured and modular fork of the original [bolt.diy](https://github.com/stackblitz-labs/bolt.diy).

It keeps the practical AI workspace spirit of the original project, but pushes the platform further in three major directions:

- a cleaner layered architecture
- a more modern workspace and settings UX
- broader and more structured provider/model support

Opurion is no longer only a chat UI fork. It is evolving toward a maintainable AI workspace platform with controlled integrations, better runtime reliability, and a stronger foundation for settings, user scope, collaboration, and reusable artifacts.

---

## Original Project

Opurion is based on the original [bolt.diy](https://github.com/stackblitz-labs/bolt.diy) project.

That link is intentionally preserved here, because the original project provided the foundation this fork builds on.

---

## Screenshots and Demo

### Main workspace

<img width="1400" height="883" alt="Bolt2-main" src="https://github.com/user-attachments/assets/6a7e51de-8982-4594-889e-f67d7d4f7317" />

### Updated workspace / UI direction

<img width="2462" height="1172" alt="image" src="https://github.com/user-attachments/assets/76af0720-a629-4fba-b6ed-86d02c1b7bdf" />

### Video demo

[![Watch the video](https://github.com/user-attachments/assets/6a7e51de-8982-4594-889e-f67d7d4f7317)](https://github.com/user-attachments/assets/150f7c90-6274-4103-9fff-a2423dcdcb36)

---

## Why This Fork Exists

Opurion was created to take the original idea further in a more structured direction.

The goal is to evolve from:

> a useful AI chat and build tool

toward:

> a layered AI workspace platform with modern UX, structured settings, cleaner provider handling, stronger persistence boundaries, and room for controlled future expansion

The project prioritizes:

- clarity
- maintainability
- modularity
- graceful degradation
- optional integrations
- practical UX improvements
- controlled evolution instead of random sprawl

---

## What Has Changed in Opurion

Compared to a simpler baseline fork direction, Opurion has already introduced significant work in areas such as:

- modernized workspace UX
- redesigned settings control panel direction
- persistent top-bar provider/model selection
- settings-based provider key management
- broader model/provider support
- streaming timeout and response lifecycle fixes
- cleaner user-scoped persistence behavior
- artifact CRUD foundation
- collaboration-related backend groundwork
- stronger test and validation coverage
- orchestration and runtime guardrails

This fork-specific work is tracked in the project changelog.

---

## Current Product Direction

Opurion is being shaped around five practical pillars.

### 1. Modern AI Workspace UX

A more deliberate workspace layout with a cleaner sidebar, persistent header controls, chat-first flow, workbench-aware layout behavior, and a more structured settings experience.

### 2. Layered Internal Architecture

A clearer dependency model that keeps UI, platform concerns, core runtime, integrations, and infrastructure from collapsing into one another.

### 3. Structured Provider and Model Support

Provider selection, model selection, and provider key management are being moved into a more coherent settings-and-workspace model instead of scattered ad hoc controls.

### 4. Better Runtime Reliability

The project is actively fixing high-impact runtime problems such as hanging streams, bad timeout logic, unsupported provider parameter issues, and delayed-response handling.

### 5. Stronger Foundation for Future Growth

Artifacts, collaboration scope, user-scoped persistence, auth boundaries, and backend-agnostic persistence patterns are being built in a way that supports future expansion.

---

## Architecture Overview

Opurion follows a layered dependency model:

`ui → platform → core → integrations → infrastructure`

This layered direction is already reflected in the current repository structure and in the project’s existing architectural documentation.

### Layer responsibilities

#### `/ui`

- React frontend
- workspace layout
- settings surfaces
- topbar/sidebar UX
- user-facing controls

#### `/platform`

- authentication
- user/session context
- provider configuration
- prompt and app-level control logic
- access control and platform-facing policy concerns

#### `/core`

- chat runtime
- LLM abstraction
- streaming logic
- model routing
- request/response lifecycle behavior
- tool invocation contracts

#### `/integrations`

- provider adapters
- external system connectors
- MCP integration
- persistence connectors such as PostgREST-facing integration paths
- optional external service bindings

#### `/infrastructure`

- database abstraction
- migrations
- schema/version handling
- logging
- encryption utilities
- config loading
- low-level persistence support

### Design rules

- no database logic inside UI
- no integration logic inside UI
- no circular dependencies
- optional integrations must degrade gracefully
- missing optional infrastructure must not crash the app

These principles are already part of the current repo direction.

---

## UX Direction

Opurion has already moved beyond a basic chat layout direction.

Recent UX work in the fork includes:

- provider/model selectors moved into the top toolbar
- header controls visible before first message
- chat-first workspace flow
- improved sidebar structure and bottom controls
- explicit `Recents` and section-based sidebar language
- settings control panel redesign direction
- better dark/light theme alignment
- workbench visibility control improvements
- landing page redesign work
- settings surface tokenization and theme consistency

In practice, the project is moving toward a more modern assistant workspace model rather than a simple single-view chat screen.

---

## Settings and Control Panel Direction

Settings in Opurion are no longer treated as an afterthought.

The project is actively moving toward a settings workspace / control panel model with:

- cleaner information architecture
- better category grouping
- more structured navigation
- stronger visual consistency with the main workspace
- provider and model management that belongs in settings, not scattered in chat

This is an important part of the project’s UX direction.

---

## Provider and Model Support

Opurion has expanded provider/model support significantly.

The project now supports a broad multi-provider selection experience and includes support for a large set of models across providers such as:

- OpenAI
- Anthropic
- Google
- AWS Bedrock
- DeepSeek
- Mistral
- Groq
- GitHub
- Cohere

Model/provider selection has also been moved into a more persistent top-level workspace pattern, and provider/model visibility is tied to configured keys/settings rather than being scattered loosely in the chat surface.

The exact supported set will continue to evolve, but the direction is clear: Opurion is designed to be a practical multi-provider workspace.

---

## Runtime Reliability Improvements

A major focus of this fork has been runtime correctness and resilience.

Recent work includes fixes for issues such as:

- chat streaming stalls
- wrong timeout model based on total elapsed time
- delayed chunk handling
- missing `await` behavior in streaming paths
- fallback handling when model message conversion fails
- provider-specific parameter mismatch issues
- Codex response hangs caused by incorrect request parameter usage

The project is actively prioritizing "works reliably in real use" over superficial feature accumulation.

---

## Persistence, Auth, and User Scope

Opurion is moving beyond a purely loose single-user state model.

The project now includes fork-level work in areas such as:

- user-scoped profile persistence
- authenticated profile context switching
- secure cookie policy sharing
- user-scoped access guards for collaboration-aware persistence
- stronger auth/session correctness
- backend-agnostic persistence abstraction

This gives the project a better foundation for future multi-user and collaboration scenarios.

---

## Artifacts and Collaboration Foundations

Opurion is also laying groundwork for more structured reuse and collaboration.

Fork work already includes:

- artifact CRUD foundation
- visibility controls such as private, project, and public scope
- project/user ownership awareness
- collaboration-related persistence access guards
- invitation flow direction using email-based project sharing semantics

These areas are still evolving, but they are already part of the real project direction.

---

## Database and Persistence Modes

Opurion supports multiple persistence modes and is designed to degrade gracefully.

The current database direction includes:

- SQLite as a practical default/fallback path
- optional external PostgreSQL
- optional PostgREST
- graceful behavior when optional integrations are absent or unavailable

### Current persistence philosophy

- SQLite should remain practical for local and simpler setups
- external database modes should remain optional
- missing external services should not hard-crash the app
- persistence behavior should stay backend-agnostic where practical

---

## Optional Integrations

Opurion is not designed around bundling every service by default.

The project documentation already describes optional integration patterns including external integrations such as MCP and n8n, with graceful failure expectations rather than mandatory bundled assumptions.

This philosophy remains important:

- integrations should be modular
- configuration should be explicit
- absence of optional services should degrade gracefully
- the base application should still remain usable

---

## Security Direction

Security and control boundaries matter in Opurion.

The current project direction includes security-related areas such as:

- JWT authentication
- RBAC / role separation
- encrypted API key storage
- encrypted integration credential handling
- structured logging
- centralized error handling
- input validation

That remains part of the project’s direction as the product evolves.

---

## Testing and Validation Direction

Opurion is increasingly test- and guardrail-oriented.

The fork changelog shows significant investment in:

- unit tests
- runtime parser coverage
- performance and stability tests
- provider routing coverage
- streaming regression tests
- orchestration guardrails
- Docker and smoke validation
- changelog, test, lint, and typecheck enforcement around commit/push flows

This is intentional. The project is moving toward stronger change safety and fewer silent regressions.

---

## Repository Structure

The repository already reflects the platform direction.

At a high level, the repo includes areas such as:

- `app`
- `bolt.work`
- `core`
- `docs`
- `electron`
- `functions`
- `infrastructure`
- `integrations`
- `platform`
- `public`
- `scripts`
- `tests`
- `types`
- `ui`
- `unit-tests`

Use the existing structure unless there is a strong reason to change it.

---

## Getting Started

Clone the repo:

    git clone https://github.com/Arvekari/Opurion.git
    cd Opurion

Install dependencies:

    pnpm install

Run development mode:

    pnpm run dev

Build:

    pnpm run build

Typecheck:

    pnpm typecheck

Run unit tests:

    pnpm test:unit

Depending on what you are changing, you may also want to run additional validation or smoke commands defined in the repo scripts.

---

## Who This Project Is For

Opurion is useful for people who want:

- a more structured fork of bolt.diy
- a multi-provider AI workspace direction
- a modernized assistant/workbench UX
- a codebase with stronger architectural boundaries
- a platform that can evolve toward richer settings, persistence, user scope, artifacts, and integrations without becoming unmaintainable

---

## Contributing

Contributions are welcome.

Please read:

`CONTRIBUTING.md`

before opening a pull request.

Opurion benefits most from contributions that improve:

- architecture
- runtime reliability
- UX coherence
- provider support
- test coverage
- documentation
- maintainability

---

## Changelog

Fork-specific changes are tracked in:

`CHANGELOG.md`

This changelog is specific to Opurion and does not attempt to mirror upstream bolt.diy release history.

---

## Credits

- original foundation: [bolt.diy](https://github.com/stackblitz-labs/bolt.diy)
- fork direction, architecture evolution, and continued development: Markku Arvekari
- thanks to everyone who has contributed ideas, fixes, validation, and iteration to Opurion

---

## Project Status

Opurion is active, evolving, and already significantly beyond a cosmetic fork.

The architecture direction is real.  
The UX direction is real.  
The provider/runtime/persistence improvements are real.  
And there is still more to do.

That is exactly the point.
