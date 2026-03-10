# Settings UX Refactor - Modern Two-Panel Layout

**TaskId:** `bolt2-p1-settings-ux-modern-refactor`  
**Priority:** P1  
**Status:** DONE  
**Created:** 2026-03-10
**Completed:** 2026-03-10

## Goal

Refactor the Settings view to use a modern, sleek, application-style settings layout with a persistent left navigation and dedicated content panel.

This is a **layout and UX change**, not a request to copy exact settings content from another product. The purpose is to create a structured, premium desktop-app-like settings workspace.

## Core UX Idea

Transform Settings from a loose collection of separate pages into a **cohesive settings workspace** with:

- **Persistent left-side settings navigation** (always visible)
- **Main content panel on the right** (selected category loads here)
- **All settings categories visible** in a structured way
- **Modern, premium, desktop-app-like feel**

**Key principle:** Settings should feel like a dedicated app section, not a random form page.

## Target Layout Structure

```
Settings Page
├─ Left Settings Navigation
└─ Main Settings Content Area
```

### 1. Left Settings Navigation

**Purpose:** Persistent vertical settings menu that acts as main navigation for settings categories.

**Example structure (bolt2.dyi-specific categories):**

```
Settings
├ General
├ Account
├ Privacy
├ Capabilities
├ Connectors
├ API Providers
├ Projects
├ Appearance
└ Advanced
```

**UX expectations:**

- Visually clean and compact but readable
- Active section clearly highlighted
- Modern dark-theme friendly styling
- Works like a desktop SaaS app (ChatGPT/Linear/Notion settings style)
- Categories load into right-side content panel (NOT modal windows)
- Remains visible while browsing settings

### 2. Main Settings Content Area

**Purpose:** Primary workspace where selected category content appears.

**Structure:**

```
Main Content Area
├ Page Title
├ Section Description
├ Setting Group / Card
├ Setting Group / Card
└ Action Area
```

**Content characteristics:**

- Section titles with clear hierarchy
- Grouped fields (not flat lists)
- Cards or structured blocks
- Descriptions under headings
- Spacious, premium feel

## Visual and Interaction Style

**Target aesthetic:**

- ✅ Modern, sleek, clean, spacious
- ✅ Premium SaaS-like desktop application style
- ✅ Dark theme compatible
- ✅ Visually structured with clear hierarchy
- ❌ NOT: old admin panel, cramped forms, temporary popups

### Design Characteristics

#### 1. Clear Content Hierarchy

Visual separation between:

- Page title
- Subsection titles
- Help text / descriptions
- Setting controls

User should immediately understand:

- Where they are
- Which settings section is active
- Which settings belong together

#### 2. Grouped Settings Blocks

Settings in right-side panel should be grouped into logical sections rendered as:

- Cards
- Panels
- Section blocks
- Bordered groups

**Example API Providers grouping:**

```
API Providers
├ OpenAI settings (card/block)
├ Anthropic settings (card/block)
└ Bedrock settings (card/block)
```

**Key principle:** Fields should NOT appear as one long flat list.

#### 3. Keep Settings Inside Main Frame

- Settings view occupies the main content area
- Settings categories remain visible (left nav)
- Navigation feels connected (not disconnected)
- Switching sections feels smooth and structured

Settings should feel like **one cohesive workspace**.

## Layout Behaviour

### Desktop (Primary)

**Pattern:** Fixed left settings navigation + larger content area on right

**Suggested split:**

```
| Settings Nav (narrower) | Main Settings Content (flexible)        |
|-------------------------|-----------------------------------------|
| General                 | Page title                              |
| Account                 | Description                             |
| Privacy                 | Settings groups/cards                   |
| Billing                 | Actions                                 |
| ...                     |                                         |
```

### Mobile / Smaller Width

On smaller screens, settings navigation can collapse into:

- Drawer
- Tab selector
- Compact top selector

**But:** Desktop default should be full two-column settings frame.

## Implementation Notes

### Current State Analysis Needed

1. Locate existing Settings implementation:
   - Current route(s): `app/routes/*settings*` or `app/ui/settings/*`
   - Current components: settings forms, provider config, etc.
   - Current layout structure

2. Identify settings categories currently in use:
   - API Providers (OpenAI, Anthropic, etc.)
   - Custom prompts
   - Database config
   - Profile/user settings
   - Other product-specific settings

### Proposed Implementation Approach

#### Phase 1: Layout Shell

1. Create new `SettingsLayout` component with two-panel structure:
   - `<SettingsNavigation />` (left panel)
   - `<SettingsContent />` (right panel)
2. Define settings category routes/structure
3. Implement navigation state (active section highlighting)

#### Phase 2: Category Components

1. Migrate existing settings content into category-specific components
2. Apply modern card/block grouping to each category
3. Standardize spacing, typography, visual hierarchy

#### Phase 3: Responsive Polish

1. Desktop: fixed two-column layout
2. Mobile: collapsible navigation (drawer or tabs)
3. Smooth transitions between categories

#### Phase 4: Dark Theme Compatibility

1. Ensure all new components respect theme context
2. Test visual hierarchy in both light/dark modes
3. Validate contrast and readability

### Files Likely to Change

- `app/routes/api.settings.ts` or equivalent (if exists)
- `app/ui/settings/` directory (create if missing)
- `app/components/settings/` (new components)
- Existing settings forms/config components (refactor into new layout)

### Styling Considerations

- Use existing design system (Tailwind CSS utilities)
- Match sidebar navigation patterns for consistency
- Reuse card/panel components if available
- Ensure spacing matches app-wide design tokens

## Required UX Outcome

After refactor, when user opens Settings, it should feel like:

✅ A dedicated app section (not a temporary page)  
✅ Clearly organized with visible structure  
✅ Visually modern and premium  
✅ Easy to scan and navigate  
✅ Easy to expand with more settings categories later  
✅ Scalable without breaking layout

## Acceptance Criteria

The UX refactor is successful when:

1. ✅ **Two-panel layout:** Settings opens in clear main frame with left nav + right content
2. ✅ **Persistent navigation:** Left-side settings nav remains visible while browsing
3. ✅ **Content loading:** Selected category loads into main content panel (not separate pages)
4. ✅ **Modern feel:** Page feels sleek, structured, and premium (not cramped/outdated)
5. ✅ **Scalability:** Layout supports future settings categories cleanly
6. ✅ **Cohesion:** Settings feels like one workspace (not scattered forms)
7. ✅ **Hierarchy:** Visual hierarchy clearly separates titles, descriptions, controls
8. ✅ **Grouping:** Settings are grouped into logical blocks/cards (not flat lists)
9. ✅ **Responsive:** Works on desktop (full layout) and mobile (collapsed nav)
10. ✅ **Theme compatible:** Works in both light and dark themes

## Important Clarifications

**DO NOT:**

- Copy exact content, fields, wording from reference examples
- Change product-specific settings logic
- Introduce breaking changes to existing settings functionality

**DO:**

- Follow layout pattern and navigation structure
- Apply modern visual hierarchy
- Create sleek settings workspace UX
- Keep bolt2.dyi-specific settings content

## References

- Reference pattern inspiration: ChatGPT/Linear/Notion-style settings (layout only)
- Current sidebar implementation: `app/components/sidebar/` (for nav consistency)
- Theme system: Dark/light mode handling patterns

## Success Metrics

Post-implementation validation:

1. User can navigate all settings categories without confusion
2. Settings page load time remains acceptable
3. No regressions in existing settings functionality
4. Settings layout scales cleanly when new categories added
5. Mobile experience is functional (even if not primary focus)

## Next Steps

1. Analyze current Settings implementation (routes, components, structure)
2. Design settings category organization (map existing settings to new structure)
3. Create SettingsLayout component shell
4. Migrate first settings category as proof-of-concept
5. Iterate on remaining categories
6. Polish responsive behavior and theme compatibility
7. Add unit/integration tests for navigation and category loading
8. Update user documentation if Settings UI changed significantly
