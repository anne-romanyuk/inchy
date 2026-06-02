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
     `src/styles.css`, themed for all four themes, so reuse the class as-is and
     do NOT re-style hover per screen). Used by every Cancel / dismiss button:
     goal task inline edit (`.goal-detail-task__cancel`), goal modal & goal
     date-picker (Today/Clear) in `GoalsPage.tsx` / `GoalDatePicker.tsx`,
     `today/AddTaskModal.tsx`, `today/CompletionScopeModal.tsx` ("Just for
     today" + `.scope-confirm__cancel`), `today/ParentTaskCompletionModal.tsx`
     ("Keep it open"), `focus/Pomodoro.tsx`, `plan/PlanPage.tsx` (range nav) and
     the `notes/NotesPage.tsx` editor toolbar (its `.is-active` toggles keep
     their accent on hover via a scoped guard);
   destructive → `.goal-ghost-button .goal-ghost-button--danger`;
   round "+" add icon → `.add-icon-btn` (one shared circle, `<span>+</span>` inside — reuse everywhere).
   For other primitives use `.ui-card`, `.ui-modal`, `.ui-badge`, `.ui-field`, `.ui-progress`,
   `.ui-section-header`, `.ui-page-header`, `.ui-empty`.
5. For app-specific UI, reuse the TaskRow / GoalCard / GoalTaskRow / TimerWidget /
   AlertsWidget structures where applicable.
6. Do not create one-off visual styles for a single screen unless there is a clear product reason.
7. Any new component must support Light, Dream, and Moon themes (test all three).
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
- add `:root[data-theme=...] .my-component` hacks inside components — fix the token instead
- introduce UI that only works in Light theme
- use styling that feels childish or overly decorative

### Before creating ANY new UI component, answer:

1. Can this be composed from existing primitives?
2. Can an existing component be extended with a variant instead?
3. Is this a genuinely new pattern or a one-off custom?
4. Does it work in all three themes with no theme-specific overrides?
5. Is an example/story added to the documentation?

If a change consumes a raw hex, an arbitrary px value, or a custom card box-shadow, stop and use a token.

### Notes for this codebase

- Styling is global CSS class based (`src/styles.css`, ~11k lines) — no CSS-in-JS.
- Legacy bespoke classes still exist (`task-add`, `goal-primary-button`, `pomodoro-confirm__button`,
  `goal-modal__*`, `task-modal__*`, `goal-health-pill`, `needs-attention__*`, …). They are being
  migrated to `.ui-*` primitives. When you touch one, migrate it; do not add new bespoke variants.
- Themes: Light = no attribute (`light`), Dream = `data-theme="dream"`, Moon = `data-theme="moon"`
  (`dark` is a dead legacy alias — do not target it for new work).
