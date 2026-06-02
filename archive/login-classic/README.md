# Classic login page (archived )

Snapshot of the original login UI before the "Sprout" redesign.
These files are NOT imported or routed anywhere — kept for reference / rollback.

- AuthPage.tsx        — original page wrapper (centered .auth-stage)
- SoftLoginModal.tsx  — modal markup (shared component, still in use live)
- SoftLoginModal.css  — original grey-glass + pink-gradient styling
- SoftButton.css      — button base used by the modal submit

To roll back: copy AuthPage.tsx back over src/features/auth/AuthPage.tsx
and remove the import of sprout-auth.css.
