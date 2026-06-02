import { useRef, useState, type FormEvent, type ReactNode } from "react";
import "./SoftButton.css";
import "./SoftLoginModal.css";

export type AuthMode = "login" | "register";

export type AuthErrors = {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

export type AuthFormValues = {
  name?: string;
  email: string;
  password: string;
  confirmPassword?: string;
};

export type SoftLoginModalProps = {
  open?: boolean;
  mode?: AuthMode;
  loading?: boolean;
  status?: string;
  statusVariant?: "error" | "success";
  onModeChange?: (mode: AuthMode) => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  errors?: AuthErrors;
  emailError?: string;
  passwordError?: string;
  /** Override the heading shown above the form (login mode only). */
  loginTitle?: string;
  /** Override the submit button label (login mode only). */
  loginSubmitLabel?: string;
  /** Optional supporting line rendered under the title. */
  subtitle?: ReactNode;
  /** Render decorative leading icons inside the email/password fields. */
  withFieldIcons?: boolean;
  /** Extra content placed after the "or" divider (e.g. an OAuth button). */
  secondaryAction?: ReactNode;
};

export const AUTH_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const AUTH_MIN_PASSWORD_LENGTH = 8;

export function validateAuthFields(mode: AuthMode, values: AuthFormValues): AuthErrors {
  const isRegister = mode === "register";
  const name = values.name?.trim() ?? "";
  const email = values.email.trim();
  const password = values.password;
  const confirmPassword = values.confirmPassword ?? "";
  const errors: AuthErrors = {};

  if (isRegister) {
    if (!name) {
      errors.name = "Name is required.";
    } else if (name.length < 2) {
      errors.name = "Name must be at least 2 characters.";
    }

  }

  if (!email) {
    errors.email = "Email is required.";
  } else if (!AUTH_EMAIL_PATTERN.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!password) {
    errors.password = "Password is required.";
  } else if (password.length < AUTH_MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${AUTH_MIN_PASSWORD_LENGTH} characters.`;
  }

  if (isRegister) {
    if (!confirmPassword) {
      errors.confirmPassword = "Confirm your password.";
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }
  }

  return errors;
}

export function SoftLoginModal({
  open = true,
  mode,
  loading = false,
  status,
  statusVariant = "error",
  onModeChange,
  onSubmit,
  errors = {},
  emailError,
  passwordError,
  loginTitle,
  loginSubmitLabel,
  subtitle,
  withFieldIcons = false,
  secondaryAction,
}: SoftLoginModalProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [internalMode, setInternalMode] = useState<AuthMode>("login");
  const [visiblePasswords, setVisiblePasswords] = useState({
    password: false,
    confirmPassword: false,
  });

  if (!open) {
    return null;
  }

  const activeMode = mode ?? internalMode;
  const isRegister = activeMode === "register";
  const title = isRegister ? "Create account" : (loginTitle ?? "Welcome");
  const submitLabel = isRegister ? "Sign up" : (loginSubmitLabel ?? "Login");
  const resolvedErrors: AuthErrors = {
    ...errors,
    email: errors.email ?? emailError,
    password: errors.password ?? passwordError,
  };

  const handleModeChange = (nextMode: AuthMode) => {
    setInternalMode(nextMode);
    formRef.current?.reset();
    setVisiblePasswords({
      password: false,
      confirmPassword: false,
    });
    onModeChange?.(nextMode);
  };

  const togglePasswordVisibility = (field: keyof typeof visiblePasswords) => {
    setVisiblePasswords((current) => ({
      ...current,
      [field]: !current[field],
    }));
  };

  return (
    <div className="soft-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div className="soft-modal__panel">
        <h1 className="soft-modal__title" id="auth-title">
          {title}
        </h1>
        {subtitle ? <p className="soft-modal__subtitle">{subtitle}</p> : null}
        <form ref={formRef} className="soft-modal__form" onSubmit={onSubmit} noValidate>
          {isRegister ? (
            <label className={`soft-modal__field ${resolvedErrors.name ? "is-invalid" : ""}`.trim()}>
              <input
                type="text"
                name="name"
                autoComplete="name"
                aria-label="Name"
                placeholder="your name"
                minLength={2}
                aria-invalid={Boolean(resolvedErrors.name)}
                aria-describedby={resolvedErrors.name ? "name-error" : undefined}
              />
              {resolvedErrors.name ? (
                <span className="soft-modal__error" id="name-error">
                  {resolvedErrors.name}
                </span>
              ) : null}
            </label>
          ) : null}
          <label className={`soft-modal__field soft-modal__field--email ${resolvedErrors.email ? "is-invalid" : ""}`.trim()}>
            {withFieldIcons ? (
              <span className="soft-modal__field-icon soft-modal__field-icon--mail" aria-hidden="true" />
            ) : null}
            <input
              type="email"
              name="email"
              autoComplete="email"
              aria-label="Email"
              placeholder="you@example.com"
              aria-invalid={Boolean(resolvedErrors.email)}
              aria-describedby={resolvedErrors.email ? "email-error" : undefined}
            />
            {resolvedErrors.email ? (
              <span className="soft-modal__error" id="email-error">
                {resolvedErrors.email}
              </span>
            ) : null}
          </label>
          <label className={`soft-modal__field soft-modal__field--password ${resolvedErrors.password ? "is-invalid" : ""}`.trim()}>
            <span className="soft-modal__password-control">
              {withFieldIcons ? (
                <span className="soft-modal__field-icon soft-modal__field-icon--lock" aria-hidden="true" />
              ) : null}
              <input
                type={visiblePasswords.password ? "text" : "password"}
                name="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                aria-label="Password"
                placeholder="password"
                minLength={AUTH_MIN_PASSWORD_LENGTH}
                aria-invalid={Boolean(resolvedErrors.password)}
                aria-describedby={resolvedErrors.password ? "password-error" : undefined}
              />
              <button
                className="soft-modal__password-toggle"
                type="button"
                aria-label={visiblePasswords.password ? "Hide password" : "Show password"}
                aria-pressed={visiblePasswords.password}
                onClick={() => togglePasswordVisibility("password")}
              >
                <span className="soft-modal__eye-icon" aria-hidden="true"></span>
              </button>
            </span>
            {resolvedErrors.password ? (
              <span className="soft-modal__error" id="password-error">
                {resolvedErrors.password}
              </span>
            ) : null}
          </label>
          {isRegister ? (
            <label className={`soft-modal__field ${resolvedErrors.confirmPassword ? "is-invalid" : ""}`.trim()}>
              <span className="soft-modal__password-control">
                <input
                  type={visiblePasswords.confirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  autoComplete="new-password"
                  aria-label="Confirm password"
                  placeholder="confirm password"
                  minLength={AUTH_MIN_PASSWORD_LENGTH}
                  aria-invalid={Boolean(resolvedErrors.confirmPassword)}
                  aria-describedby={resolvedErrors.confirmPassword ? "confirm-password-error" : undefined}
                />
                <button
                  className="soft-modal__password-toggle"
                  type="button"
                  aria-label={visiblePasswords.confirmPassword ? "Hide password" : "Show password"}
                  aria-pressed={visiblePasswords.confirmPassword}
                  onClick={() => togglePasswordVisibility("confirmPassword")}
                >
                  <span className="soft-modal__eye-icon" aria-hidden="true"></span>
                </button>
              </span>
              {resolvedErrors.confirmPassword ? (
                <span className="soft-modal__error" id="confirm-password-error">
                  {resolvedErrors.confirmPassword}
                </span>
              ) : null}
            </label>
          ) : null}
          {status ? (
            <p className={`soft-modal__status ${statusVariant === "error" ? "is-error" : ""}`.trim()} role="status">
              {status}
            </p>
          ) : null}
          <div className="soft-modal__actions">
            <button className="soft-button soft-modal__submit" type="submit" aria-busy={loading}>
              <span className="soft-button__label" hidden={loading}>
                {submitLabel}
              </span>
              <span className="soft-modal__submit-loader" hidden={!loading}>
                <ButtonGooeyLoader />
              </span>
            </button>
          </div>
          <svg width="0" height="0" aria-hidden="true" focusable="false">
            <defs>
              <filter id="button-gooey-filter">
                <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                <feColorMatrix
                  in="blur"
                  mode="matrix"
                  values="
                    1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 18 -7"
                  result="gooey"
                />
                <feComposite in="SourceGraphic" in2="gooey" operator="atop" />
              </filter>
            </defs>
          </svg>
          <div className="soft-modal__divider" aria-hidden="true">
            <span>or</span>
          </div>
          {secondaryAction ? (
            <div className="soft-modal__secondary">{secondaryAction}</div>
          ) : null}
          <p className="soft-modal__helper">
            {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
            <button className="soft-modal__auth-link" type="button" onClick={() => handleModeChange(isRegister ? "login" : "register")}>
              {isRegister ? "Log in" : "Sign up"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}

function ButtonGooeyLoader() {
  return (
    <span className="button-gooey-loader" role="status" aria-label="Loading">
      <span className="button-gooey-loader__stage" aria-hidden="true">
        <span className="button-gooey-loader__dot button-gooey-loader__dot--left"></span>
        <span className="button-gooey-loader__dot button-gooey-loader__dot--middle"></span>
        <span className="button-gooey-loader__dot button-gooey-loader__dot--right"></span>
      </span>
    </span>
  );
}
