# CLAUDE.md

Planner app — goals, tasks, focus/Pomodoro. React 19 + Vite + Hono + SQLite.

## UI work — read this first

This project has a unified design system. Before writing or changing any UI:

- **Rules:** `AGENTS.md` (UI Agent Skill — the binding rules).
- **Reference:** `docs/design-system.md`.
- **Tokens:** `src/styles/design-tokens.css` — colors/spacing/radius/typography/shadows, per theme.
- **Primitives:** `src/styles/ui-components.css` — `.ui-card`, `.ui-modal`, `.ui-badge`,
  `.ui-field`, `.ui-progress`, `.ui-page-header`, `.ui-section-header`, `.ui-empty`.
- **Buttons:** no `.ui-btn` — reuse existing components: primary/save/add →
  `.task-add` (the "Add goal" pill; leading `+` span only for add actions), cancel/ghost →
  `.pomodoro-btn .pomodoro-btn--ghost-text`, destructive → `.goal-ghost-button .goal-ghost-button--danger`.

Core principles: use tokens, never hardcode colors/spacing/shadows; reuse primitives before
inventing; every component must work in Light / Dream (`data-theme="dream"`) / Moon
(`data-theme="moon"`); preserve the soft, airy, calm, slightly-magical-but-adult personality;
one primary action per area; destructive actions stay quiet until intent. **Every new screen is a
composition of existing components, not a new visual invention.**

## Project layout

- `src/features/*` — Today, goals, focus (Pomodoro), today widgets/modals, auth, profile.
- `src/styles.css` — global CSS (~11k lines, being migrated onto tokens/primitives).
- `server/` — Hono API + SQLite. `shared/` — zod schemas/constants.
- Dev: `npm run go` (installs + runs server & client).
