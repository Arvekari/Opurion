# Bolt2 UI Design Directive

Version: 1.0  
Effective date: 2026-03-07  
Purpose: define a clean, enterprise-grade UI identity for Bolt2 that is clearly distinct from the original Bolt project.

This directive is mandatory for all frontend work and consolidates established UX guidance patterns (clarity, consistency, accessibility, and reduced cognitive load).

## 1) Core Design Philosophy

Bolt2 UI decisions must follow these principles:

1. Clarity first
   - UI communicates function immediately.
   - Prefer clear labels, visible hierarchy, and consistent patterns.
   - Avoid decorative UI, unnecessary visual noise, and ambiguous icons.

2. Predictability
   - Repeated interaction patterns must behave the same across screens.
   - Buttons, menus, and action placement are consistent by module.

3. Minimal cognitive load
   - Minimize decision fatigue and option overload.
   - Use progressive disclosure and simple workflows.

4. Functional aesthetics
   - Visual style supports usability first.
   - Prefer clean typography, neutral colors, subtle depth, restrained motion.
   - Avoid heavy gradients, noisy backgrounds, and excessive color usage.

## 2) Layout System

- Use a grid-based layout.
- Use an 8px spacing scale only: 4, 8, 16, 24, 32, 48.
- Do not use arbitrary spacing values.
- Default page shell:
  - top navigation
  - sidebar navigation
  - primary content area
  - optional secondary panel
- Constrain width for readability:
  - 1200px default content
  - 1600px wide dashboards

## 3) Typography Rules

- Primary font: Inter.
- Approved alternatives: Roboto, Source Sans 3.
- Use no more than two font families in one screen.
- Maintain consistent line-height; avoid very thin weights.

Recommended scale:

- H1: 28px
- H2: 22px
- H3: 18px
- Body: 14–16px
- Caption: 12px

## 4) Color System

Required palette structure:

- Primary
- Neutral grayscale
- Success
- Warning
- Error

Rules:

- Never rely on color alone to convey meaning.
- Maintain strong contrast.
- Dark mode support is required.

## 5) Navigation Design

- Keep navigation simple and predictable.
- Use sidebar navigation for core modules.
- Use icons + labels.
- Keep clear active state.
- Avoid navigation nesting deeper than two levels.

Suggested module order:

- Dashboard
- Workflows
- Agents
- Data Tables
- Integrations
- Logs
- Settings

## 6) Button Design

Required types:

- Primary
- Secondary
- Danger
- Text

Rules:

- One primary button per section.
- Avoid too many competing call-to-actions.
- Primary = main action, secondary = alternative, text = subtle, danger = destructive.

## 7) Form Design

Rules:

- Label above input.
- Helper text for complex fields.
- Inline validation feedback.
- Do not use placeholder-only labels.

## 8) Settings and Preferences

Rules:

- Group related settings into clear sections.
- Avoid long single-page scrolling where possible.
- Use toggles for simple binary preferences.

Suggested groups:

- General
- User Preferences
- AI Settings
- Integrations
- Security
- System

## 9) Icons and Visual Language

Approved open-source icon libraries:

- Lucide (preferred)
- Heroicons
- Phosphor
- Tabler

Bolt2 standard icon choice: Lucide, due to consistency, modern style, lightweight footprint, and React support.

## 10) Component Library Standard

Approved systems:

- Radix UI
- shadcn/ui
- Mantine

Recommended baseline for Bolt2: shadcn/ui + Radix.

## 11) Motion and Animation

Allowed:

- hover feedback
- loading indicators
- panel transitions

Avoid:

- excessive or distracting motion

## 12) Accessibility Baseline

All UI work must satisfy:

- keyboard navigation support
- screen reader compatibility
- sufficient contrast
- visible focus indicators

## 13) Dashboard Rules

- Prioritize information clarity over density.
- Use cards for primary metrics.
- Group related charts.
- Keep detailed tables readable and scannable.

Preferred structure:

1. Metrics row
2. Charts section
3. Detailed table section

## 14) Differentiation from Original Bolt

Bolt2 must be visibly distinct via:

- cleaner navigation
- improved typography
- single consistent icon language
- more neutral palette
- stronger spacing consistency
- tighter component consistency

## 15) Implementation Rules for UI Refactors

When modifying UI:

1. Identify and reuse existing components where possible.
2. Refactor inconsistent components to this system.
3. Replace inconsistent icons with approved library usage (prefer Lucide).
4. Normalize spacing to the 8px scale.
5. Standardize typography.
6. Simplify navigation structures.
7. Remove visual clutter.
8. Verify accessibility baseline and dark-mode behavior.

## 16) Visual Quality Target

Bolt2 should match the quality characteristics of modern enterprise tools:

- calm
- structured
- professional

## 17) Workspace Reference Examples (High Level)

Use the following files as the canonical visual references for where new workspace UI should go and how it should function at a high level:

- `docs/development/index.workspace.html`
  - Defines the primary workspace shell (sidebar, top bar, content area, section hierarchy).
- `docs/development/settings.workspace.html`
  - Defines the settings workspace structure and behavior expectations.
- `docs/development/layout.css`
  - Defines shared tokens, layout primitives, and baseline styling rules.

Implementation rule:

- New workspace UI work must map to these references first, then be implemented using existing Bolt2 components and `bolt-elements-*` design tokens.
- efficient

Reference quality examples:

- Linear
- Vercel dashboard
- GitHub UI
- Supabase UI

## 17) Repository Structure Guidance

Preferred UI organization:

```
/ui
  /components
  /layout
  /icons
  /theme
  /pages
```

Do not mix layout/presentation concerns with business logic.

## 18) Definition of Done for UI Changes

A UI change is complete only when all are true:

- directive is followed
- spacing is consistent with scale
- icons use approved library
- accessibility baseline is met
- dark mode works
- components are reusable
