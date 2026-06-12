# Desktop ↔ Mobile Parity Tracker

Single source of truth for "what exists on desktop vs mobile". One row = one
capability = one manual test case. Fill the **Mobile** / **Desktop** cells as
features land; use the Notes column for decisions ("mobile does X instead").

**Update rule:** any PR that adds/changes a screen, modal, or confirmation
updates the matching rows here (same PR). New feature → add a row first,
implement second.

## Legend

| Mark | Meaning |
|------|---------|
| ✅ | Implemented & verified by hand |
| 🟡 | Partial — works but reduced (see Notes) |
| ❌ | Missing |
| ➖ | Not applicable by design (intentionally different pattern) |
| ❓ | Unverified — test and replace with ✅/🟡/❌ |

## How mobile works (testing notes)

- Mobile layout is **breakpoint-gated, not platform-gated**: `useIsMobile()` =
  `(max-width: 768px)` (`src/shared/hooks/useIsMobile.ts`). Test in a desktop
  browser's responsive mode at ≤768px; no native build needed.
- Mobile chrome = `MobileShell` (bottom tab bar), desktop chrome = `AppShell`
  (sidebar). Routes are shared; some routes swap to a dedicated mobile screen,
  the rest render the **desktop page inside the mobile shell** (interim state).
- Mobile styles live in `src/styles/45-mobile.css`.

### Route → implementation map

| Route | Desktop impl | Mobile impl | Mobile status |
|---|---|---|---|
| `/today` | `TodayPage.tsx` | `TodayMobile.tsx` | Dedicated mobile screen |
| `/today/alerts` | — (redirects to `/today`) | `TodayAlertsMobile.tsx` | Mobile-only page |
| `/goals` | `GoalsPage.tsx` | `GoalsMobileList` (inside `GoalsPage.tsx`) | Dedicated mobile list |
| `/goals/:goalId` | `GoalDetailPage` (in `GoalsPage.tsx`) | `GoalDetailMobile.tsx` | Dedicated mobile screen |
| `/plan` | `PlanPage.tsx` | same desktop page in shell | ❌ no mobile variant, no tab entry |
| `/focus` | `FocusPage.tsx` → `Pomodoro.tsx` | same page in shell | ❓ needs mobile QA pass |
| `/notes` | `NotesPage.tsx` | same desktop page in shell | ❌ no mobile variant |
| `/settings` | `SettingsPage.tsx` | same desktop page in shell | ❌ no mobile variant, no tab entry |
| `/` (logged out) | `AuthPage.tsx` (Sprout) | same page | ❓ responsive state unverified |
| Add/Edit task | `AddTaskModal.tsx` | `AddTaskModalMobile.tsx` | Dedicated, heavily reduced (see §3) |

---

## 1. Shell & navigation

| Capability | Desktop | Mobile | Notes |
|---|---|---|---|
| Chrome | ✅ sidebar | ✅ bottom tab bar | Tabs: Today, Goals, Focus, More |
| Greeting + avatar | ✅ sidebar brand | ❌ | Mobile has no profile entry point at all |
| Today entry | ✅ | ✅ | |
| Goals entry | ✅ | ✅ | |
| Focus entry | ✅ | ✅ | |
| Plan entry | ✅ | ❌ | Mobile: only by typing the URL |
| Notes entry | ✅ | 🟡 | "More" tab currently just lands on `/notes` |
| Settings entry | ✅ | ❌ | Unreachable on mobile |
| Logout | ✅ sidebar button | ❌ | Unreachable on mobile |
| "More" sheet (Notes/History/Settings/Profile/Logout) | ➖ | ❌ | Planned per `MobileShell.tsx` comment — not built |
| Progress / Templates | ➖ disabled stubs | ➖ not shown | Placeholder pages |
| Page transition animation | ✅ | ❓ | |
| Safe-area insets (notch/home bar) | ➖ | ❓ | Declared in 45-mobile.css header — verify on device |

## 2. Today screen

| Capability | Desktop | Mobile | Notes |
|---|---|---|---|
| Header | ✅ "Today" + Add button | ✅ date + open/done counter | Different by design |
| Progress ring | ➖ | ✅ | Mobile-only summary |
| Category filter | ✅ all categories, scrollable tabs w/ arrows | 🟡 only All / Goals / Other | Decide: are real categories needed on mobile? |
| Task list w/ time + category | ✅ table columns | ✅ chips on rows | |
| Reorder tasks (drag) | ✅ handle | ✅ | |
| Complete toggle | ✅ | ✅ | |
| Completion scope modal (goal-linked: today vs whole) | ➖ | ➖ | Removed by design: Today completes only today's occurrence; whole goal task/subtask completion happens in Goal detail |
| "All subtasks done — close parent?" modal | ➖ | ➖ | Removed by design: Today no longer completes whole goal items |
| Edit standalone task | ✅ | ✅ | Mobile blocks editing non-standalone (`editTask` guard) |
| Edit goal-linked occurrence | ❓ | ❌ | Verify desktop behavior, then decide mobile |
| Delete task | ✅ + recurrence scope dialog | 🟡 swipe-delete, always single | Mobile can't delete future/series of a recurring task |
| Swipe gestures on rows | ➖ | ✅ delete | |
| Create recurring task | ✅ | ❌ | See §3 |
| Repeat badge/label on task rows | ❓ | ❌ | |
| Link task to focus timer | ✅ inline Pomodoro + fly animation | ✅ navigates to `/focus?taskId=` | Different by design |
| Pomodoro panel on page | ✅ right column | ➖ | Mobile uses Focus tab |
| Needs-attention | ✅ widget (right column) | ✅ banner → `/today/alerts` page | Different by design |
| Goals journey widget (+settings toggle) | ✅ | ❌ | Decide: mobile equivalent or ➖ |
| Empty state ("No tasks for today") | ✅ | ✅ | |

## 3. Add / Edit task modal

Desktop `AddTaskModal` vs mobile `AddTaskModalMobile`.

| Capability | Desktop | Mobile | Notes |
|---|---|---|---|
| Title input | ✅ | ✅ | |
| Category pick + inline create | ✅ | ✅ | Shared `TaskCategoryPicker` |
| Date picker (Today/Tomorrow shortcuts) | ✅ | ✅ | Shared `GoalDatePicker` |
| Time picker | ✅ | ✅ | |
| Duration input | ✅ | ✅ | |
| Repeat: enable + frequency (daily/weekly/monthly/yearly) | ✅ | ❌ | Whole recurrence block missing on mobile |
| Repeat: custom interval ("every N…") | ✅ | ❌ | |
| Repeat: weekday selection | ✅ | ❌ | |
| Repeat: month days + 29/30/31 overflow (skip / last-day) | ✅ | ❌ | |
| Repeat: year months | ✅ | ❌ | |
| Repeat: end date | ✅ | ❌ | |
| Repeat: human-readable summary line | ✅ | ❌ | |
| "Save to My Tasks" (default templates) | ✅ | ❌ | |
| My-tasks suggestions list in modal | ✅ | ❌ | |
| Queue several tasks before submitting | ✅ | ❌ | |
| Edit mode (prefilled) | ✅ | 🟡 | Mobile: standalone only, no repeat fields |
| Recurring edit applies to series | ✅ (scope `series`) | ➖ | Mobile can't edit recurring fields yet |
| Confirm when disabling repeat on existing series | ✅ `RepeatDisableConfirm` | ❌ | |
| Delete from edit + recurrence scope (single/future/series) | ✅ `RepeatDeleteConfirm` | 🟡 plain delete, single only | |
| Validation errors (title required, end-date ≥ start) | ✅ | 🟡 title only | |

## 4. Alerts / Needs attention

| Capability | Desktop | Mobile | Notes |
|---|---|---|---|
| Overdue / Due today / Due soon groups | ✅ widget | ✅ `/today/alerts` page | |
| Counts summary | ✅ | ✅ header + banner | |
| Add to today from alert | ✅ | ✅ | Shared `AddToTodayButton` |
| Link to goal | ✅ | ❓ | |
| Empty "All clear" state | ✅ | ❓ | Mobile banner just hides — page state? |

## 5. Goals list

| Capability | Desktop | Mobile | Notes |
|---|---|---|---|
| Stats (goals count, tasks done) | ✅ | ✅ | |
| Goal cards (status, progress) | ✅ | ✅ rows | |
| Add goal | ✅ | ✅ FAB | Both open `GoalEditorModal` |
| Open goal detail | ✅ | ✅ | |
| Delete goal | ✅ via detail + `window.confirm` | 🟡 swipe-delete, **no confirmation** | ⚠️ destructive without confirm — fix or accept |
| `?new=1` deep link opens editor | ✅ | ✅ | Shared code path |
| Empty state | ❓ | ❓ | |

## 6. Goal detail

Desktop `GoalDetailPage` vs `GoalDetailMobile`.

| Capability | Desktop | Mobile | Notes |
|---|---|---|---|
| Summary hero (icon, dates, status, progress) | ✅ | ✅ | |
| Edit goal | ✅ editor modal | ✅ full-screen edit page | |
| Delete goal (with confirm) | ✅ `window.confirm` | ❓ | Mobile has trash icon — verify confirm exists |
| Task list + per-task progress | ✅ | ✅ | |
| Add goal task | ✅ inline row | ✅ create page | |
| Inline rename task | ✅ | ✅ | |
| Task icon picker | ✅ popover | ✅ mobile select | |
| Task deadline picker | ✅ | ✅ | |
| Health badges (overdue/due today/due soon) | ✅ | ✅ | |
| Status pill (done/open) | ✅ | ❓ | |
| Reorder tasks (drag) | ✅ | ❓ | |
| Add task to today | ✅ | ✅ | |
| Schedule task to arbitrary date | ✅ `ScheduleGoalTaskButton` | ❌ | New desktop feature, no mobile counterpart |
| Subtasks: add / complete / delete | ✅ | ✅ | |
| Subtasks: reorder | ✅ | ❓ | |
| Subtask → add to today | ✅ | ✅ | |
| Task note | ✅ | ✅ | |
| Delete scheduled goal task/subtask → occurrence scope confirm | ✅ `GoalOccurrenceDeleteConfirm` | ❌ | Not imported in `GoalDetailMobile` |

## 7. Goal editor (create/edit modal)

Shared component; mobile gets sheet styling (`45-mobile.css`).

| Capability | Desktop | Mobile | Notes |
|---|---|---|---|
| Name, description | ✅ | ✅ | |
| Goal icon picker | ✅ | ❓ | |
| Start / target dates | ✅ | ❓ | |
| Tasks: add / rename / icon / reorder / delete | ✅ | ❓ | Drag-reorder on touch? |
| Save / cancel | ✅ | ✅ | |

## 8. Plan

| Capability | Desktop | Mobile | Notes |
|---|---|---|---|
| Entry point in nav | ✅ | ❌ | No tab on mobile |
| Week view (grid, timed events) | ✅ | ❌ | Desktop layout renders in shell — unusable width |
| Day ("today") view timeline | ✅ | ❌ | |
| Week/day toggle | ✅ | ❌ | |
| Prev / next range nav | ✅ | ❌ | |
| All-day deadline chips | ✅ | ❌ | |
| Click event → edit task modal | ✅ | ❌ | |
| Add task from plan | ✅ | ❌ | |
| Day view history mode (`TaskHistoryContent`) | ✅ | ❌ | History planned for mobile "More" sheet |

## 9. Focus / Pomodoro

Same component everywhere (`fullPage` on `/focus`); mobile parity = usability, not existence.

| Capability | Desktop | Mobile | Notes |
|---|---|---|---|
| Full-page timer on `/focus` | ✅ | ❓ | Sizing/layout at ≤768px |
| Mode toggle (focus / short / long break) | ✅ | ❓ | |
| Start / pause / resume | ✅ | ❓ | |
| Reset + confirm (assigned-focus / unassigned-progress variants) | ✅ | ❓ | |
| Mode-switch mid-session confirm | ✅ | ❓ | |
| Settings modal (durations) | ✅ | ❓ | |
| Linked task chip (`?taskId=` from Today) | ✅ | ❓ | This is mobile's only task↔focus link — must work |
| Session persistence across reload | ✅ | ❓ | |
| Chime on completion | ✅ | ❓ | iOS audio restrictions |

## 10. Notes

| Capability | Desktop | Mobile | Notes |
|---|---|---|---|
| Entry point | ✅ sidebar | 🟡 "More" tab lands here | |
| Mobile layout | ➖ | ❌ | Desktop sidebar+grid renders in shell |
| Categories sidebar + counts | ✅ | ❌ | |
| Archived section | ✅ | ❌ | |
| Search | ✅ | ❌ | |
| Date filter | ✅ | ❌ | |
| New note / editor | ✅ | ❌ | |
| Fullscreen editor | ✅ | ❌ | |
| Pin / unpin | ✅ | ❌ | |
| Delete note + confirm | ✅ | ❌ | |
| Note category picker | ✅ | ❌ | |

## 11. Settings

| Capability | Desktop | Mobile | Notes |
|---|---|---|---|
| Entry point | ✅ sidebar | ❌ | Unreachable on mobile |
| Mobile layout | ➖ | ❌ | |
| Profile: photo upload + crop modal + delete | ✅ | ❌ | |
| Profile: name / details / country combobox | ✅ | ❌ | |
| Danger zone (account actions) | 🟡 placeholder | ❌ | |
| Tasks: category rename + color | ✅ | ❌ | |
| Tasks: category delete modal (detach vs delete-tasks) | ✅ | ❌ | ⚠️ delete-tasks also wipes recurring series of that category |
| Goals: journey widget toggle | ✅ | ❌ | Toggle only affects desktop Today |
| Notifications | ➖ disabled | ➖ | |

## 12. Auth (Sprout login)

| Capability | Desktop | Mobile | Notes |
|---|---|---|---|
| Login / register toggle | ✅ | ❓ | |
| Email+password with field icons | ✅ | ❓ | |
| Continue with Google | ✅ | ❓ | |
| Headline + character art layout | ✅ | ❓ | Likely needs stacked layout ≤768px |
| Loader / eyes animation | ✅ | ❓ | |

## 13. Modals & confirmations inventory

Quick cross-reference — every dialog in the app and where it can fire.

| Dialog | Source | Desktop | Mobile |
|---|---|---|---|
| Add/Edit task | `AddTaskModal` / `AddTaskModalMobile` | ✅ | 🟡 reduced |
| Completion scope (today vs whole goal task) | removed | ➖ | ➖ |
| Close parent goal task? | removed | ➖ | ➖ |
| Disable repeat confirm | `RepeatDisableConfirm` (AddTaskModal) | ✅ | ❌ |
| Delete recurring: single/future/series | `RepeatDeleteConfirm` (AddTaskModal) | ✅ | ❌ |
| Goal editor | `GoalEditorModal` | ✅ | ✅ sheet |
| Delete goal confirm | `window.confirm` (goal detail) | ✅ | ❌ (swipe deletes silently) |
| Goal occurrence delete scope | `GoalOccurrenceDeleteConfirm` | ✅ | ❌ |
| Pomodoro reset confirm (2 variants) | `PomodoroResetConfirmModal` | ✅ | ❓ |
| Pomodoro mode-switch confirm | same component | ✅ | ❓ |
| Pomodoro settings | `PomodoroSettingsModal` | ✅ | ❓ |
| Avatar crop | `AvatarCropModal` (Settings) | ✅ | ❌ |
| Task category delete (detach / delete-tasks) | `TaskCategoryDeleteModal` (Settings) | ✅ | ❌ |
| Delete note confirm | NotesPage inline | ✅ | ❌ |

## 14. Known gaps — shortlist

Priority candidates, in rough order of user pain:

1. **Mobile dead ends:** Settings, Plan, History, Profile and **Logout** are
   unreachable — the "More" sheet from the `MobileShell` plan doesn't exist yet.
2. **Recurring tasks don't exist on mobile:** can't create, can't edit the
   rule, delete is always single-occurrence (no future/series scopes).
3. **Silent destructive action:** goal swipe-delete on mobile has no
   confirmation; desktop confirms and warns it removes all tasks inside.
4. **`GoalOccurrenceDeleteConfirm` missing on mobile** goal detail — deleting
   scheduled tasks/subtasks skips the occurrence-scope question.
5. **Notes / Settings / Plan render desktop layouts** inside the mobile shell.
6. **Schedule-goal-task-to-date** (`ScheduleGoalTaskButton`) is desktop-only.

### Unwired components (exist in repo, rendered nowhere)

- `src/features/profile/CharacterOnboarding.tsx`
- `src/features/profile/ProfileDropdown.tsx`

If these are intended for the mobile "More"/profile work, wire them; otherwise
archive them so this doc stays honest.
