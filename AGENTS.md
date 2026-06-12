# AGENTS.md — Planner project agent instructions

## UI Agent Skill: Unified Product UI System

This project has ONE design system. Full reference: **`docs/design-system.md`**.
Tokens: **`src/styles/design-tokens.css`**. Primitives: **`src/styles/ui-components.css`**.

Every new screen must be a **new composition of existing components, not a new visual
invention.** Preserve the product personality at all times: **soft, airy, calm, slightly
magical, adult, non-corporate** — do not redesign it into something "new".

### When creating or modifying UI in this project

1. Always use existing design tokens for colors, spacing, radius, typography, and shadows.
2. Never hardcode colors, shadows, spacing, or typography if a token exists.
3. Prefer existing core components before creating new ones.
4. Buttons: reuse existing components — **do not** invent a `.ui-btn`.
   Primary/save/add → `.task-add` (the "Add goal" pill; add a leading `+` span only for *add* actions);
   Cancel/ghost → `.pomodoro-btn .pomodoro-btn--ghost-text` (quiet muted text by
     default; on hover the text brightens to `--c-text-primary` with a soft
     `--c-surface-soft` pill — this hover lives on the primitive itself in
     `src/styles.css`, driven by tokens, so reuse the class as-is and
     do NOT re-style hover per screen. Footer/action Cancel buttons should match
     timer settings sizing: 42px tall, 84px minimum width, `var(--space-5)`
     inline padding, and no wrapping). Used by every Cancel / dismiss button:
     goal task inline edit (`.goal-detail-task__cancel`), goal modal & goal
     date-picker (Today/Clear) in `GoalsPage.tsx` / `GoalDatePicker.tsx`,
     `today/AddTaskModal.tsx`, `today/CompletionScopeModal.tsx` ("Just for
     today" + `.scope-confirm__cancel`), `today/ParentTaskCompletionModal.tsx`
     ("Keep it open"), `focus/Pomodoro.tsx`, `plan/PlanPage.tsx` (range nav),
     `settings/SettingsPage.tsx` category management, and
     the `notes/NotesPage.tsx` editor toolbar (its `.is-active` toggles keep
     their accent on hover via a scoped guard);
   destructive/delete → use `DeleteActionButton` (`.goal-ghost-button .goal-ghost-button--danger .delete-action-button`) so delete actions share the trash icon, transparent default background, danger text/icon, and danger-soft hover. Per-screen CSS may only set layout/size for a delete button; do NOT restyle its color, background, hover, icon, or shadow locally. Disabled danger-zone delete actions should stay visually destructive instead of becoming generic gray disabled buttons;
   round "+" add icon → `.add-icon-btn` (one shared circle, `<span>+</span>` inside — reuse everywhere).
   For other primitives use `.ui-card`, `.ui-modal`, `.ui-badge`, `.ui-field`, `.ui-progress`,
   `.ui-section-header`, `.ui-page-header`, `.ui-empty`.
5. For app-specific UI, reuse the TaskRow / GoalCard / GoalTaskRow / TimerWidget /
   AlertsWidget structures where applicable.
6. Do not create one-off visual styles for a single screen unless there is a clear product reason.
7. The app ships **one theme only: Forest** (`<html data-theme="forest">`, the default in
   `useTheme.ts`). Build for Forest using tokens — do **not** add other-theme variants.
8. Any new state must define default, hover, active, disabled, focus, and error behavior where relevant.
9. All destructive actions use the danger semantic system and must NOT be visually aggressive
   unless a confirmation is required — delete icons stay neutral until hover/focus.
10. All repeated UI patterns must be converted into reusable components.
11. Every UI change must preserve the product style: soft, airy, calm, slightly magical, adult.
12. Avoid childish decoration, excessive gradients, random shadows, inconsistent borders, layout jumps.
13. Keep visual hierarchy clear: one primary action per area; secondary actions visually quieter.
14. Ensure responsive behavior and stable layout when content grows (scroll inside panels).
15. Update the documentation / examples when changing shared components.

### Do not

- create a new custom button style for a single screen
- create a new card style if a `.ui-card` variant works
- use raw hex / rgba colors in JSX or CSS where a token exists
- use arbitrary spacing values outside the `--space-*` scale
- make action icons different sizes across screens
- create badges with custom one-off colors — use `.ui-badge` tones
- create modals with a different header/body/footer structure
- add `:root[data-theme=...] .my-component` hacks — there is only the Forest theme; fix the token instead
- hardcode Forest's colors directly — always go through the design tokens
- use styling that feels childish or overly decorative

### Before creating ANY new UI component, answer:

1. Can this be composed from existing primitives?
2. Can an existing component be extended with a variant instead?
3. Is this a genuinely new pattern or a one-off custom?
4. Does it read correctly in the Forest theme using only tokens (no hardcoded colors)?
5. Is an example/story added to the documentation?

If a change consumes a raw hex, an arbitrary px value, or a custom card box-shadow, stop and use a token.

### Notes for this codebase

- Styling is global CSS class based, Forest-only, no CSS-in-JS. `src/styles.css` is just an
  `@import` barrel; rules live in per-feature files under `src/styles/` (`30-goals.css`,
  `31-today.css`, `32-notes.css`, `20-pomodoro.css`, `02-base.css` for shared, `99-responsive.css`
  for all `@media`, …). **Edit the matching feature file, not the barrel.** See the CSS file map in
  `CLAUDE.md`. (Deprecated multi-theme overrides are parked in `archive/legacy-themes.css`, unused.)
- Legacy bespoke classes still exist (`task-add`, `goal-primary-button`, `pomodoro-confirm__button`,
  `goal-modal__*`, `task-modal__*`, `goal-health-pill`, `needs-attention__*`, …). They are being
  migrated to `.ui-*` primitives. When you touch one, migrate it; do not add new bespoke variants.
- Theme: **Forest only** (`data-theme="forest"`, hard-set in `index.html`; no live theme switcher).
  Light / Dream / Moon / `dark` are **deprecated** — do not build, test, or add styles for them.
  Their old `:root[data-theme="dream|moon|dark"]` overrides were lifted out of `src/styles.css`
  into **`archive/legacy-themes.css`** (a reference snapshot — NOT imported, NOT part of the build,
  do not read/edit it for normal work). Don't restore or extend them. Forest values live in
  `src/styles/design-tokens.css` (+ the `--pomodoro-grad-*` block at the top of `src/styles.css`).

## Desktop / Mobile Feature Tracking

Use the Claude guard prompt at **`.claude/agents/mobile-desktop-guard.md`** as the
project checklist for desktop/mobile separation and parity. Treat it as read-only
review guidance: inspect and report/act on violations, but do not blindly edit from
that prompt alone.

For any change that adds or changes a screen, modal, confirmation, route, shared
component, data hook, API contract, or mobile/desktop behavior:

1. Check whether both desktop and mobile are affected.
2. Update **`docs/desktop-mobile-parity.md`** in the same change when feature status,
   modal inventory, or verification status changes.
3. Respect the guard's separation rules:
   - `useIsMobile` belongs only at sanctioned shell/router branch points.
   - Mobile markup/styles stay in mobile-only files and `src/styles/45-mobile.css`.
   - Desktop modules must not statically import mobile modules, and vice versa.
   - Shared hooks/API/schema changes must stay platform-neutral and require both
     desktop and mobile verification notes.
4. Before finishing a relevant change, review the diff using the guard's report
   mindset: classify files as desktop-only, mobile-only, shared component, shared
   contract, route/shell seam, or unrelated; then call out any remaining parity or
   Capacitor-readiness risks.

## QA Testing Agent

Use the Claude QA prompt at **`.claude/agents/qa-tester.md`** as the project
checklist for full QA/regression passes. The full QA workflow is **on-demand
only**: use it when the user explicitly asks to test something ("протестируй",
"прогони QA", "проверь регрессию", "use qa-tester"). Normal implementation
verification (`tsc`, build, targeted smoke checks) still applies after code
changes, but do not launch a full QA sweep unless requested.

When running that QA workflow:

1. Act as a tester, not a fixer: do not edit app code, commit, or patch around
   blockers during the QA pass.
2. Create dedicated QA users/data through the API; never read, mutate, or delete
   another user's data. Use read-only SQLite queries only for integrity checks.
3. Test proportionately to the scope: API happy paths, auth/validation/error
   cases, UI flows, reload persistence, console/network errors, and adjacent
   regressions from the QA regression map.
4. For destructive or migration-heavy scenarios, use an isolated database
   (`PLANNER_DB=/tmp/qa-planner.db`) instead of the development database.
5. Include mobile-width checks when the touched feature has mobile parity or is
   listed in `docs/desktop-mobile-parity.md`.
6. End with the QA report shape from the prompt: TL;DR, issues table, repro
   steps/evidence, coverage, and untested risks with severity and priority.
