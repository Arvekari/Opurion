# Bolt2 UI Redesign Implementation Tickets

Version: 1.0  
Date: 2026-03-07  
Derived from:

- `docs/development/ui-design-directive.md`
- `docs/development/ui-redesign-action-plan.md`

## Ticket Index

1. `UI-T1` — Design tokens: spacing + typography + color roles
2. `UI-T2` — Chat surface controls normalization
3. `UI-T3` — App shell + navigation active-state normalization
4. `UI-T4` — Reusable component variant migration (buttons/forms/cards/tables)
5. `UI-T5` — Lucide icon normalization on high-traffic surfaces
6. `UI-T6` — Settings IA grouping and scanability refactor
7. `UI-T7` — Dashboard hierarchy pass (metrics → charts → details)
8. `UI-T8` — Accessibility and motion hardening pass

---

## UI-T1 — Design tokens: spacing + typography + color roles

- **Workstream:** WS1 Foundation
- **Priority:** P0
- **Scope (files/views):** `ui/components/*`, `ui/pages/*`, shared theme/token files
- **UX problem:** Inconsistent spacing and text rhythm reduce scannability and increase visual noise.
- **Directive rules applied:** Layout 8px scale; typography scale; role-based colors; dark mode requirement.
- **Acceptance criteria:**
  - All newly touched shared primitives use spacing tokens limited to `4/8/16/24/32/48`.
  - Shared text styles expose H1/H2/H3/body/caption tokens and are used by core layouts.
  - Color usage in touched components maps to role tokens (`primary/neutral/success/warning/error`) for light + dark themes.
  - No hard-coded one-off spacing or color values in touched shared components.
  - No measurable startup/bundle regression from token setup.
- **Validation steps:**
  - Run targeted unit tests for touched UI primitives.
  - Run typecheck/lint for touched files.
  - Verify dark mode readability on chat shell, settings, and dashboard entry pages.
- **Regression risk:** Medium (wide styling impact).

## UI-T2 — Chat surface controls normalization

- **Workstream:** WS3 Components
- **Priority:** P0
- **Scope (files/views):** chat input, send/actions row, chat mode toggles, related control components.
- **UX problem:** Chat controls have inconsistent spacing/states and are high-frequency interaction points.
- **Directive rules applied:** One clear primary action per section; predictable interaction patterns; restrained visual style.
- **Acceptance criteria:**
  - Input, send button, and auxiliary actions share consistent spacing/size hierarchy.
  - Primary CTA remains singular and visually clear on chat surface.
  - Focus/hover/active states are consistent and keyboard-visible.
  - Streaming vs non-streaming states preserve reliable send/stop behavior.
  - Render path remains lightweight with no unnecessary rerender-heavy additions.
- **Validation steps:**
  - Run `unit-tests/components/chat/ChatBox.input-regression.test.tsx`.
  - Perform keyboard-only interaction check for input + send + mode toggle.
  - Verify dark mode contrast for chat controls.
- **Regression risk:** Medium.

## UI-T3 — App shell + navigation active-state normalization

- **Workstream:** WS2 App Shell and Navigation
- **Priority:** P0
- **Scope (files/views):** top nav, sidebar nav, content shell wrappers, active-state logic.
- **UX problem:** Navigation predictability suffers when patterns vary by screen.
- **Directive rules applied:** Standard shell layout; icon + label nav; <=2 nesting levels; predictable active states.
- **Acceptance criteria:**
  - Main screens use a consistent shell structure.
  - Sidebar module order follows directive target ordering where applicable.
  - Active state styling is consistent across modules.
  - Navigation depth does not exceed two levels in updated areas.
  - No heavy animation or layout thrash in shell transitions.
- **Validation steps:**
  - Traverse primary modules and confirm active state + placement consistency.
  - Keyboard navigation check for sidebar items.
  - Smoke test route switching performance.
- **Regression risk:** Medium.

## UI-T4 — Reusable component variant migration

- **Workstream:** WS3 Components
- **Priority:** P1
- **Scope (files/views):** shared buttons, forms, cards, tables, dialog/panel wrappers.
- **UX problem:** Variant drift causes inconsistent interaction semantics and visual hierarchy.
- **Directive rules applied:** Button type system; form labeling/validation standards; reusable component consistency.
- **Acceptance criteria:**
  - Button variants are limited to `primary/secondary/danger/text` in updated surfaces.
  - Form fields in updated surfaces use label-above + helper/validation patterns.
  - Card/table primitives share spacing, border, and heading conventions.
  - Updated sections avoid multiple competing primary CTAs.
- **Validation steps:**
  - Component-level tests for variant rendering and state behavior.
  - Manual pass on representative forms and tables.
  - Lint/typecheck for updated components.
- **Regression risk:** Medium.

## UI-T5 — Lucide icon normalization on high-traffic surfaces

- **Workstream:** WS4 Iconography
- **Priority:** P1
- **Scope (files/views):** navigation, chat controls, top-frequency action bars.
- **UX problem:** Mixed iconography reduces cohesion and recognition speed.
- **Directive rules applied:** Lucide as default icon language; consistency in icon weight/size.
- **Acceptance criteria:**
  - Updated high-traffic surfaces use Lucide icons exclusively unless explicitly justified.
  - Icon sizes and alignment are consistent per control type.
  - Icon-only actions include accessible labels/tooltips.
  - Icon swaps do not increase bundle cost materially.
- **Validation steps:**
  - Visual diff or checklist for icon set consistency on targeted screens.
  - Accessibility check for icon-only controls.
  - Build-size sanity check for icon imports.
- **Regression risk:** Low to Medium.

## UI-T6 — Settings IA grouping and scanability refactor

- **Workstream:** WS5 Settings UX
- **Priority:** P1
- **Scope (files/views):** settings navigation and section grouping.
- **UX problem:** Long linear settings flows increase cognitive load and reduce discoverability.
- **Directive rules applied:** grouped settings sections; reduced long scrolling; predictable structure.
- **Acceptance criteria:**
  - Settings are grouped as General, Preferences, AI, Integrations, Security, System (or documented nearest equivalent).
  - Each section has clear heading and short descriptive context.
  - Long scrolling is reduced through sectional organization.
  - Navigation/anchor behavior is predictable and keyboard reachable.
- **Validation steps:**
  - Walkthrough of settings tasks (profile, model settings, integration toggles).
  - Keyboard and focus traversal checks.
  - Verify no settings capability regression.
- **Regression risk:** Medium.

## UI-T7 — Dashboard hierarchy pass

- **Workstream:** WS5 Dashboard UX
- **Priority:** P2
- **Scope (files/views):** dashboard overview, metric cards, chart blocks, detail tables.
- **UX problem:** Information order and density can obscure top-priority signals.
- **Directive rules applied:** metrics-first layout; grouped charts; scannable details table.
- **Acceptance criteria:**
  - Dashboard follows `metrics row → charts section → detailed table section` in updated view.
  - Metric cards are scannable with clear labels and values.
  - Chart grouping reflects related metrics.
  - Detailed tables remain readable without clutter.
- **Validation steps:**
  - Visual scan test for first 5-second comprehension.
  - Check responsive behavior for primary breakpoints.
  - Confirm no data parity regressions.
- **Regression risk:** Medium.

## UI-T8 — Accessibility and motion hardening pass

- **Workstream:** WS6 Accessibility and Motion
- **Priority:** P2
- **Scope (files/views):** top user journeys touched by tickets UI-T1..UI-T7.
- **UX problem:** Inconsistent focus/contrast/motion can block usability for keyboard and assistive-tech users.
- **Directive rules applied:** keyboard support; focus visibility; screen-reader compatibility; restrained motion.
- **Acceptance criteria:**
  - Critical flows are keyboard operable end-to-end.
  - Focus indicators are visible on interactive controls.
  - Color contrast checks pass in light and dark mode for touched surfaces.
  - Motion is functional/subtle only.
- **Validation steps:**
  - Keyboard-only smoke pass on top workflows.
  - Contrast checks for text and controls in both themes.
  - Reduced-motion sanity check.
- **Regression risk:** Low to Medium.

---

## Mapping to Ongoing Work taskIds

- `bolt2-p2-ui-redesign-t1` → UI-T1
- `bolt2-p2-ui-redesign-t2` → UI-T2
- `bolt2-p2-ui-redesign-t3` → UI-T5
- `bolt2-p1-ui-redesign-task-identification` → Ticket set creation and backlog mapping in this document
