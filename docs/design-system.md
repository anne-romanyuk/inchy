# Planner UI System

The single, intentional component system for the Planner app (goals, tasks, focus/Pomodoro). The goal: every screen should look like a **composition of the same well-made parts**, never a one-off invention.

**Product personality (never lose this):** soft, airy, calm, slightly magical but adult. Glassy surfaces, gentle gradients, generous spacing, quiet secondary actions. Not corporate, not childish, not neon.

---

## 1. Where things live

| Layer | File | What it is |
|---|---|---|
| Tokens | `src/styles/design-tokens.css` | Colors, spacing, radius, typography, shadows — per theme. **Source of truth.** |
| Primitives | `src/styles/ui-components.css` | `.ui-*` reusable component classes built only from tokens. |
| App CSS | `src/styles.css` | Existing bespoke styles (being migrated onto tokens over time). |
| Skill | `AGENTS.md` | Permanent rules for any agent/dev touching UI. |

Both token files are imported at the top of `src/styles.css`. They are **additive** — adding them changed nothing visually; they exist to be adopted.

---

## 2. Theme

**One theme: Forest.** Set as `data-theme="forest"` on `:root` (the single default in `useTheme.ts`).

- **Forest** — warm milk glass with sage, moss, and olive accents.

Light / Dream / Moon (and the `dark` alias) are **deprecated** — do not build, test, or style for them. Their old `:root[data-theme="…"]` blocks were lifted out of `src/styles.css` into `archive/legacy-themes.css` (a reference snapshot — not imported, not built; don't read or extend it). Because primitives read semantic tokens (`--c-*`), build everything against the tokens — never hardcode Forest's colors, and do not write `:root[data-theme=...] .my-component { … }` overrides; fix the token instead.

---

## 3. Design tokens

### Colors (semantic — never use raw hex/rgba in components)

`--c-background`, `--c-background-soft`, `--c-surface`, `--c-surface-soft`, `--c-surface-elevated`, `--c-border`, `--c-border-soft`, `--c-text-primary`, `--c-text-secondary`, `--c-text-muted`, `--c-text-on-accent`, `--c-accent`, `--c-accent-hover`, `--c-accent-soft`, `--c-accent-gradient`, `--c-danger`/`--c-danger-soft`, `--c-warning`/`--c-warning-soft`, `--c-success`/`--c-success-soft`, `--c-info`/`--c-info-soft`, `--c-focus`/`--c-focus-soft`.

### Fields — `--field-control-bg`, `--field-control-bg-active`, `--field-control-border`, `--field-control-border-hover`, `--field-control-border-focus`
Text inputs and textareas use the Today add-task title field pattern: soft cream fill, thin neutral border, slightly brighter hover, and a thin visible focus ring.

| Use | Token |
|---|---|
| Primary action | `--c-accent-gradient` (fill), text `--c-text-on-accent` |
| Destructive action | `--c-danger` (only on intent — see IconButton rule) |
| Warning / at-risk | `--c-warning` / `--c-warning-soft` |
| Success / on-track / done | `--c-success` / `--c-success-soft` |
| Muted info / metadata | `--c-text-muted`, `--c-info-soft` |
| Surfaces | `--c-surface` (panels), `--c-surface-soft` (inner), `--c-surface-elevated` (modals) |
| Borders | `--c-border`, `--c-border-soft` |
| Text | `--c-text-primary` / `--c-text-secondary` / `--c-text-muted` |

### Spacing — `--space-1..10` = 4, 6, 8, 10, 12, 16, 20, 24, 32, 40px. Use only these.

### Radius — `--radius-xs` (6, tiny controls) · `sm` (10, inputs/chips) · `md` (14, text action buttons, matching the login button shape) · `lg` (20, rows/inner cards) · `xl` (28, cards/widgets) · `2xl` (34, panels/modals) · `pill` (badges and true pills only).

### Typography — roles, not raw sizes:
`--text-page-title-*`, `--text-page-subtitle-*`, `--text-section-title-*`, `--text-card-title-*`, `--text-item-title-*`, `--text-body-*`, `--text-body-small-*`, `--text-caption-*`, `--text-label-*` (uppercase tracked), `--text-button-*`, `--text-badge-*`.

### Shadows — `--shadow-none | --shadow-soft | --shadow-medium | --shadow-elevated` + `--shadow-focus-ring`. Focus rings should read as a thin, visible highlight on fields. No other box-shadows on cards.

---

## 4. Core components (`.ui-*` primitives)

### Button — reuse the existing timer-settings components (the gold standard)
There is **no `.ui-btn`**. The canonical button components already exist and are reused everywhere:
- **Primary / save / add** → `.task-add` (the "Add goal" / "Add task" action) — compact 34px login-style rounded rectangle (`--radius-md`), hover "jump" (`translateY(-1px) scale(1.02)`), press `scale(0.94)`. Add a leading `<span aria-hidden>+</span>` only for *add* actions; omit it for *save/confirm*. Scale to context (it stretches full-width inside stacked footers; stays compact elsewhere).
- **Cancel / ghost** → `.pomodoro-btn .pomodoro-btn--ghost-text` — transparent text, darkens on hover. In footer/action contexts, match the timer settings Cancel sizing: `height: 42px`, `min-width: 84px`, `padding-inline: var(--space-5)`, `white-space: nowrap`.
- **Destructive / delete** → use `DeleteActionButton` (`.goal-ghost-button .goal-ghost-button--danger .delete-action-button`) for delete actions with the shared trash icon, transparent default background, danger text/icon, and danger-soft hover. Per-screen CSS may only set layout/size; never restyle delete color, background, hover, icon, or shadow locally. Disabled danger-zone actions still keep the delete visual language; do not restyle them as generic gray disabled buttons.

(`.task-modal__submit` is the older, chunkier 42px twin — same gradient; prefer `.task-add`.)
- **Round "+" add icon** → `.add-icon-btn` — the single shared 34px gradient circle with a centered `+`. Markup: `<button class="add-icon-btn"><span aria-hidden>+</span></button>`. Used for the Add-task modal queue and the goal "add task" row; fix it once here and it applies everywhere.

Rules: one primary action per area; reuse these classes directly; **never** invent a new button style or a `PrimaryButton`/`SaveButton`/`DeleteButton`. These classes already read the Forest tokens correctly.

### IconButton — `.ui-icon-btn` (scaffold; not yet adopted)
`.ui-icon-btn--{ghost|subtle|danger|accent}` × `.ui-icon-btn--{sm|md}`. For edit/delete/focus/more/reorder.
- Hit area is **stable** (fixed width/height); only the glyph differs.
- Icon glyph: 18px (sm) / 20px (md), everywhere.
- **Delete is not red by default** — `--danger` color appears only on hover/focus or in a confirmed destructive context.

### Card — `.ui-card`
`.ui-card--{default|soft|elevated|interactive|danger|warning|success}`. One radius/border/padding/shadow source. Today widget, Goal summary, Timer widget, Alerts widget all use this.

### Modal — `.ui-modal` inside `.ui-modal-overlay`
Structure is fixed: `__header` (`__title` + `__description`) → `__body` → `__footer` (secondary then primary, right-aligned; `--split` for confirm dialogs). Variants: `--confirmation | --destructive | --form`. Same max-width / padding / radius / overlay / close everywhere.

### Field — `.ui-field`
`__label` + `__control` (input/textarea/select) + `__helper` / `__error`. Shared height, border, radius, focus ring, placeholder color, disabled & `.is-invalid` states.

Disabled controls and fields must feel unavailable everywhere: use `cursor: not-allowed`, keep the muted disabled surface/text, and do not apply hover/focus activation styles while disabled.

### CategoryPicker — `CategoryPicker` + `.category-picker`
Use the shared React component for every category selector or filter in tasks, notes, and plan. The field is always a neutral soft pill. Selected categories render inside the field as the same colored `.task-category` label used in task rows and calendar cards. Neutral values such as "No category" and "All categories" stay white/soft. Do not recreate category dropdowns per feature.

### Badge / Pill — `.ui-badge`
`.ui-badge--{neutral|muted|accent|success|warning|danger|info}` × `--{sm|md}`, optional `--dot`. Use for statuses, priorities, categories, deadlines (due today/overdue/due soon), completed/in-progress/on-track/at-risk. **Same meaning → same badge.** No per-page custom pills.

### ProgressBar — `.ui-progress` + `.ui-progress__fill`
`.ui-progress--{success|warning|danger|soft}`. Goal/task/step/completion progress all use this.

### EmptyState — `.ui-empty` (`__art`, `__title`, `__text`, optional action button).

### Headers — `.ui-page-header` (title/subtitle/actions) and `.ui-section-header` (title/meta/action).

---

## 5. App-specific components

Composed from primitives; keep their structure consistent:

- **TaskRow** — leading checkbox · title · metadata · badges · focus control · actions · drag handle. States: normal/focused/completed/overdue/dueToday/dueSoon/disabled/dragging, with/without goal·category·priority·deadline.
- **GoalCard / GoalSummaryCard** — title · deadline (omit entirely when absent — never "Deadline: N/A") · `.ui-progress` · status `.ui-badge` · next task · alert · actions. States: on-track/at-risk/overdue/completed/empty/no-deadline.
- **GoalTaskRow** — default/completed/overdue/in-progress/dragging, with/without icon, no-deadline, editable.
- **GoalDatePicker** — token-based calendar control for goal and goal-task deadlines. Use this instead of native `input[type="date"]` in goal creation/editing surfaces. States: empty/selected/today/outside-month/open/focus/hover; supports optional deadlines with Clear.
- **TimerWidget** — no-task/with-task/running/paused/completed/reset-confirm/accumulated time. **Stable layout:** changing the focused task must not cause a layout jump.
- **AlertsWidget** — overdue/due-today/due-soon/risks; compact & expanded; scrollable when long; empty state; "add to today" action. **Must not break the timer layout when alerts grow** — scroll internally.

---

## 6. Layout rules

- Page max-width and padding consistent across Today / Goals / Goal detail.
- Same gap between widgets (`--space-7`), same inner card padding (`--space-8`).
- Same blocks → same external rhythm: identical card gaps, identical section headers, identical action-button sizes.
- Content growth scrolls **inside** a panel; it never pushes sibling panels.
- Modals centered in `.ui-modal-overlay`.

---

## 7. Adding a new component — checklist

1. Can it be **composed from existing primitives**? If yes, do that.
2. Can an existing component take a new **variant**? Prefer that over a new component.
3. Is it a genuinely new pattern, or a one-off? One-offs need a clear product reason.
4. Does it read correctly in **Forest** using only tokens, with zero hardcoded colors or theme overrides?
5. Did you add an example to `docs/ui-gallery` / Storybook (see §8)?

If it consumes a raw hex, an arbitrary px, or a custom box-shadow — stop and use a token.

---

## 8. Examples / Storybook

There is no Storybook yet. Minimal recommended setup: add `@storybook/react-vite` and write stories per primitive (`Button`, `IconButton`, `Card`, `Modal`, `Field`, `Badge`, `Progress`, `EmptyState`, `PageHeader`, `SectionHeader`) and per app component (`TaskRow`, `GoalCard`, `GoalTaskRow`, `TimerWidget`, `AlertsWidget`). Each story should show: default · all variants · disabled/error/loading · long content · empty state · edge cases. Until then, `docs/ui-gallery.html` (static) is an acceptable lightweight stand-in.

---

## 9. Migration status

The token + primitive layer is **in place and adoption-ready**. Existing bespoke classes (`task-add`, `pomodoro-confirm__button`, `goal-primary-button`, `goal-modal__*`, `task-modal__*`, `needs-attention__*`, `goal-health-pill`, etc.) still render the old way and are being migrated screen-by-screen. New work must use `.ui-*` primitives; touched bespoke code should be migrated opportunistically. See the audit/follow-up list in the project report.
