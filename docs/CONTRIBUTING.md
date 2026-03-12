# Contributing to Bolt2.dyi

Thank you for contributing to **Bolt2.dyi**.

Bolt2.dyi started as a fork of the original `bolt.diy`, but it is now evolving into something more structured: a layered, modular, and maintainable AI workspace platform with a modernized UX, broader provider support, stronger persistence boundaries, and a clearer long-term architecture.

This document explains how to contribute in a way that supports that direction.

---

## Thank You and Acknowledgement

First, thank you to the original **bolt.diy** project and its contributors for the foundation this fork builds on.

Bolt2.dyi would not exist without that work.

Second, thank you to everyone who has already contributed ideas, testing, bug reports, architectural cleanup, UI changes, provider support updates, and regression fixes for this fork.

A lot of meaningful work has already gone into Bolt2.dyi, including:

- restructuring the project toward a layered architecture
- expanding model and provider support
- modernizing the workspace and settings UX
- improving streaming reliability and timeout handling
- improving persistence, auth, collaboration, and artifact foundations
- adding stronger validation, testing, and orchestration guardrails

Those contributions matter, and they are appreciated.

---

## What Bolt2.dyi Is

Bolt2.dyi is a structured and modular fork of `bolt.diy`.

The project direction is no longer just a small chat UI fork. It is moving toward a more complete AI workspace and platform model with:

- modern assistant-style workspace UX
- workbench-aware layout
- structured settings and provider management
- multi-provider model support
- stronger internal boundaries
- optional integrations
- controlled persistence modes
- a foundation for collaboration, artifacts, and future extensibility

Contributions should support that direction.

---

## Architectural Direction

Bolt2.dyi follows a layered dependency model:

```text
ui → platform → core → integrations → infrastructure
```

This direction already exists in the repository and is part of the project’s current architecture baseline. The project also already separates areas such as core, platform, integrations, infrastructure, ui, docs, and related runtime and test directories.

### What this means in practice

- `ui` should not contain database logic
- `ui` should not contain integration-specific backend logic
- `platform` should hold application-level concerns like auth, provider config, user context, and settings logic
- `core` should own chat, runtime, and model routing behavior
- `integrations` should stay adapter-oriented
- `infrastructure` should own persistence, migration, logging, config loading, encryption helpers, and similar foundation concerns
- circular dependencies are not acceptable

If a change breaks these boundaries, it is moving the project in the wrong direction.

---

## Contribution Philosophy

Good contributions usually do one or more of the following:

- improve maintainability
- reduce coupling
- clarify architecture
- improve UX without creating structural mess
- improve provider support cleanly
- improve reliability
- improve testing
- improve documentation
- improve fallback behavior
- improve extensibility for future features

Less helpful contributions usually look like this:

- "just patch it here" logic in the wrong layer
- UI code that directly owns backend or persistence behavior
- provider-specific hacks leaking into shared architecture
- giant mixed PRs that combine unrelated refactor, feature, and formatting work
- changes that technically work but make the codebase harder to reason about later

---

## What Kinds of Contributions Are Welcome

### 1. UX and UI Improvements

Bolt2.dyi has already moved toward a more modern workspace pattern with:

- persistent model selection in the header
- a more structured sidebar
- a bottom-anchored composer flow
- a workbench-aware layout direction
- a redesigned settings control panel model

Contributions that improve this direction are welcome, especially when they are:

- responsive
- cleanly componentized
- consistent with the existing workspace language
- easy to maintain

### 2. Provider and Model Support

Provider support is an important area of the project.

Contributions are welcome for:

- adding support for new models
- improving provider abstraction
- improving provider-specific robustness
- improving model selection UX
- improving settings-based provider management

But provider logic must remain well-structured and not leak random special cases into unrelated layers.

### 3. Reliability and Runtime Fixes

Bolt2.dyi has already invested real work into:

- streaming stability
- timeout handling
- provider routing
- build-safe runtime parsing
- fallback behavior
- request lifecycle guardrails

Contributions in these areas are valuable.

### 4. Persistence, Auth, User Scope, and Collaboration Foundations

The project is no longer purely single-user in direction.

Contributions that improve:

- user-scoped persistence
- auth and session correctness
- collaboration primitives
- profile handling
- artifact ownership and visibility
- backend-agnostic persistence behavior

are welcome if they keep the architecture clean.

### 5. Tests and Validation

Tests are highly encouraged.

Particularly useful tests include:

- provider selection tests
- streaming tests
- timeout tests
- workbench and chat lifecycle tests
- auth and user-scope tests
- artifact CRUD tests
- settings logic tests
- performance and stability tests

### 6. Documentation

Documentation contributions are valuable, especially when they:

- clarify setup
- explain architecture
- document new provider behavior
- document settings and control panel behavior
- reduce ambiguity for contributors and future maintainers

---

## Repository Awareness

Before contributing, review the current repository structure and `README.md`.

The repo already reflects a layered and modular direction, including the current README architecture guidance and directory separation.

Please do not introduce new top-level concepts casually.

Use the existing structure unless there is a strong architectural reason not to.

---

## Development Setup

Clone the repository:

```bash
git clone https://github.com/Arvekari/Bolt2.dyi.git
cd Bolt2.dyi
```

Install dependencies:

```bash
pnpm install
```

Run development mode:

```bash
pnpm run dev
```

Before opening a pull request, run the checks that are relevant to your change, such as:

```bash
pnpm typecheck
pnpm test:unit
pnpm run build
```

If your change touches Docker, orchestration, provider runtime logic, or integration behavior, run the related validation commands as well.

---

## Branch Naming

Recommended branch naming:

- `feature/<name>`
- `fix/<name>`
- `refactor/<name>`
- `docs/<name>`
- `test/<name>`

Examples:

- `feature/workbench-pane`
- `fix/openai-codex-timeout`
- `refactor/settings-layout`
- `docs/readme-refresh`
- `test/provider-routing`

---

## Commit Message Style

Please use clear commit messages.

Recommended format:

```text
type(scope): short description
```

Examples:

- `feat(ui): redesign settings control panel layout`
- `fix(core): prevent stalled streaming timeout behavior`
- `refactor(platform): separate provider config state`
- `docs(contributing): rewrite contribution guide`
- `test(runtime): add parser coverage for build mode`

Recommended types:

- `feat`
- `fix`
- `refactor`
- `docs`
- `test`
- `chore`

---

## Pull Request Guidelines

Please keep pull requests focused.

A good PR should include:

### Summary

What changed?

### Why

Why was it needed?

### Scope

Which layer or layers does it affect?

### Testing

What was validated?

### UI Evidence

If the change affects UI, include screenshots, GIFs, or a concise before and after explanation.

### What to Avoid

Please avoid PRs that:

- mix unrelated work into one giant change
- break layered boundaries for convenience
- add provider-specific hacks in shared areas without explanation
- introduce hidden assumptions about infrastructure
- push optional integrations into mandatory runtime behavior
- bypass settings, provider, or config abstractions
- make the UX more fragmented instead of more coherent

---

## UX Contribution Guidance

Bolt2.dyi is actively improving its UX.

When contributing to the frontend, think in terms of:

- sidebar
- topbar
- workspace
- chat pane
- workbench pane
- settings workspace
- provider and model selection
- responsive behavior from phone to desktop

Avoid one-off UI patches that solve only one screen state while making the overall product feel less coherent.

---

## Provider Contribution Guidance

Provider contributions should:

- respect shared provider abstractions
- avoid leaking provider quirks into unrelated components
- document any special handling
- keep API key and model management understandable
- fit the current settings-oriented management model

---

## Test Expectations

If you fix a regression, add a regression test when practical.

If you add new behavior that is likely to break later, add coverage for it.

If a bug fix does not include a test, explain why.

Tests that protect behavior are more useful than tests that only mirror implementation details.

---

## AI-Assisted Contributions

AI-assisted coding tools are welcome, including:

- GitHub Copilot
- ChatGPT
- Claude
- Cursor
- Codex
- other code generation tools

But AI-generated code must still be reviewed carefully.

Contributors are responsible for ensuring that generated code:

- is correct
- fits the project structure
- does not invent fake dependencies or abstractions
- does not violate the architecture model
- remains readable and maintainable

"Generated by AI" is not a valid reason for poor structure.

---

## Reporting Bugs

Bug reports should include:

- what happened
- what you expected
- exact reproduction steps
- provider or model used, if relevant
- screenshots or logs, if helpful
- whether the issue affects `ui`, `platform`, `core`, `integrations`, or `infrastructure`

If the issue is streaming- or timeout-related, include:

- provider
- model
- whether request submission worked
- whether UI entered processing state
- whether any chunks arrived
- whether the problem was a timeout, hang, or parsing or render issue

---

## Suggesting Features

Feature suggestions are welcome, especially when they include:

- real use case
- expected UX or workflow
- affected layers
- how the feature fits the current project direction
- whether the feature should be optional or core

Bolt2.dyi benefits more from thoughtful platform evolution than from random feature accumulation.

---

## Respect for Existing Work

Please contribute with respect for:

- the original `bolt.diy` foundation
- the refactoring and restructuring already done in Bolt2.dyi
- the UX modernization already underway
- the testing and runtime hardening already in place
- future maintainability

This project is still evolving, but it already has a real direction. Contributions should strengthen that direction.

---

## Maintainer

Bolt2.dyi is maintained by:

**Markku Arvekari**<br>
Mail:   markku.arvekari@gmail.com<br>
GitHub: [@Arvekari](https://github.com/Arvekari)

---

## Final Thank You

If you contribute to Bolt2.dyi, thank you.

This project is being shaped through practical iteration, architectural cleanup, UX modernization, runtime hardening, and better long-term structure.

Good contributions do not just add code. They help make the platform clearer, stronger, and easier to evolve.
