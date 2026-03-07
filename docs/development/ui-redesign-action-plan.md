# Bolt2 UI Redesign Action Plan

Version: 1.0  
Date: 2026-03-07  
Source of truth: `docs/development/ui-design-directive.md`

This plan converts the UI directive into actionable, trackable execution tasks for the Bolt2 UI look-and-feel redesign.

## Program Goals

1. Deliver a cleaner enterprise-grade Bolt2 UI identity.
2. Standardize layout, spacing, typography, iconography, and component behavior.
3. Improve usability and accessibility while preserving product capabilities.

## Execution Model

- Work in small vertical slices with UI QA at each phase.
- No feature regression: behavior parity must be maintained while visual/system refactors are applied.
- Every task below must satisfy directive DoD checks.

## Workstreams

### WS1 — Foundation (Design Tokens + Theme)

- [ ] Define canonical spacing tokens (4/8/16/24/32/48) and replace arbitrary spacing usage.
- [ ] Define typography tokens (H1/H2/H3/body/caption).
- [ ] Define color role tokens (primary/neutral/success/warning/error) for light and dark mode.
- [ ] Add lint/check strategy for token usage where feasible.

Acceptance criteria:

- Shared tokens are used in core layouts and reusable components.
- Dark mode retains contrast and readability.

### WS2 — App Shell and Navigation

- [ ] Implement standardized app shell pattern (top nav + sidebar + primary content + optional secondary panel).
- [ ] Normalize sidebar IA to target module structure.
- [ ] Ensure active/hover/focus states are consistent.
- [ ] Remove deep nesting beyond 2 levels.

Acceptance criteria:

- Navigation behavior and placement are predictable across pages.
- One interaction pattern for nav across the app.

### WS3 — Components and Interaction Consistency

- [ ] Standardize button variants (primary, secondary, danger, text).
- [ ] Standardize form patterns (label above field, helper text, inline validation).
- [ ] Normalize card, table, modal, toast, and panel styling primitives.
- [ ] Ensure one primary CTA per section.

Acceptance criteria:

- Shared components are reusable and visually consistent.
- Form usability issues from label/validation inconsistencies are removed.

### WS4 — Iconography and Visual Language

- [ ] Adopt Lucide as default icon set for new/updated UI.
- [ ] Replace inconsistent icon usage in high-traffic screens first.
- [ ] Align icon sizing/weight and alignment rules.

Acceptance criteria:

- Updated screens use a single consistent icon language.

### WS5 — Settings and Dashboard UX

- [ ] Restructure settings into grouped sections (General, Preferences, AI, Integrations, Security, System).
- [ ] Reduce long scrolling settings flows with sectional grouping.
- [ ] Redesign dashboard hierarchy (metrics row → charts → details table).
- [ ] Improve information density without visual clutter.

Acceptance criteria:

- Settings are easier to scan and operate.
- Dashboard priority information is immediately visible.

### WS6 — Accessibility and Motion Hardening

- [ ] Validate keyboard navigation for all critical paths.
- [ ] Ensure visible focus states and screen-reader semantics.
- [ ] Validate color contrast for text + controls.
- [ ] Reduce motion to subtle/functional transitions only.

Acceptance criteria:

- WCAG baseline checks pass for targeted flows.

## Prioritized Task Backlog

### P0 — Immediate (Start now)

1. Tokenize spacing and typography primitives in shared UI styles.
2. Standardize chat surface controls (input, send/actions, states) to match directive.
3. Normalize primary navigation shell and active-state behavior.

### P1 — Next

4. Migrate key reusable components to standardized variants (buttons/forms/cards/tables).
5. Replace inconsistent icons in primary workflows with Lucide.
6. Refactor settings information architecture and section grouping.

### P2 — Follow-up

7. Dashboard visual hierarchy pass.
8. Accessibility hardening pass across top user journeys.
9. Final visual polish and motion restraint review.

## Task Template (Use for each implementation ticket)

- Title:
- Workstream:
- Priority:
- Scope (files/views):
- UX problem:
- Directive rules applied:
- Acceptance criteria:
- Validation steps:
- Regression risk:

## Validation Checklist Per PR

- [ ] Spacing uses approved scale tokens.
- [ ] Typography matches approved scale.
- [ ] Colors use role-based system and pass contrast checks.
- [ ] Navigation/layout patterns remain consistent.
- [ ] Icons are from approved set (Lucide preferred).
- [ ] Forms follow label/helper/validation pattern.
- [ ] Dark mode renders correctly.
- [ ] Keyboard + focus behavior is correct.
- [ ] No feature regression introduced.
