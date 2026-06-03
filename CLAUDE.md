# CLAUDE.md

Planner app — goals, tasks, focus/Pomodoro. React 19 + Vite + Hono + SQLite.

## UI work — read this first

This project has a unified design system. Before writing or changing any UI:

- **Rules:** `AGENTS.md` (UI Agent Skill — the binding rules).
- **Reference:** `docs/design-system.md`.
- **Tokens:** `src/styles/design-tokens.css` — colors/spacing/radius/typography/shadows (Forest theme).
- **Primitives:** `src/styles/ui-components.css` — `.ui-card`, `.ui-modal`, `.ui-badge`,
  `.ui-field`, `.ui-progress`, `.ui-page-header`, `.ui-section-header`, `.ui-empty`.
- **Buttons:** no `.ui-btn` — reuse existing components: primary/save/add →
  `.task-add` (the "Add goal" pill; leading `+` span only for add actions), cancel/ghost →
  `.pomodoro-btn .pomodoro-btn--ghost-text`, destructive → `.goal-ghost-button .goal-ghost-button--danger`.

Core principles: use tokens, never hardcode colors/spacing/shadows; reuse primitives before
inventing; the app ships **one theme only — Forest** (`data-theme="forest"`), so build for Forest
via tokens and do not add Light/Dream/Moon variants (those are deprecated; their old
`:root[data-theme=…]` blocks were moved to `archive/legacy-themes.css`, which is NOT imported
and should not be read/edited for normal work); preserve the soft,
airy, calm, slightly-magical-but-adult personality; one primary action per area; destructive actions
stay quiet until intent. **Every new screen is a composition of existing components, not a new
visual invention.**

## Project layout

- `src/features/*` — Today, goals, focus (Pomodoro), today widgets/modals, auth, profile.
- `server/` — Hono API + SQLite. `shared/` — zod schemas/constants.
- Dev: `npm run go` (installs + runs server & client).

### CSS file map (open the ONE file for the UI you're touching — don't read the whole stylesheet)

`src/styles.css` is now just an `@import` barrel (load order). The actual rules live in
per-feature files under `src/styles/`. **Edit the feature file, not the barrel.** Load order =
tokens → base → features → responsive (matters for the cascade):

- `design-tokens.css` / `ui-components.css` — Forest tokens + `.ui-*` primitives (existing).
- `01-tokens.css` — leftover inline token block (`--pomodoro-grad-*`).
- `02-base.css` — resets, layout shells, **shared buttons** (`.task-add`, `.pomodoro-btn*`,
  `.add-to-today`, `.goal-ghost-button`, `.add-icon-btn`), shared modals/confirm, utils, keyframes.
- `10-sidebar.css` · `11-profile.css` · `20-pomodoro.css` (focus panel/ring) · `21-plan.css` ·
  `30-goals.css` (goal cards/detail/tasks/journey) · `31-today.css` (task rows/modals/widgets) ·
  `32-notes.css` · `40-auth.css`.
- `99-responsive.css` — **all** `@media`/`@supports` blocks; loaded last so overrides win.

Shared things (buttons, `.ui-*`, element/global rules) live in `02-base.css`, NOT the feature files.
Whole-stylesheet `grep` still works across `src/styles/`.
