import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  SoftLoginModal,
  validateAuthFields,
  type AuthMode,
} from "../../../components/SoftLoginModal";
import { ApiError } from "../../shared/api/client";
import { queryKeys } from "../../shared/api/queryClient";
import * as authApi from "./api";
import type { AuthErrors } from "./api";
import "./sprout-auth.css";

export function AuthPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [errors, setErrors] = useState<AuthErrors>({});
  const [status, setStatus] = useState("");
  const [statusVariant, setStatusVariant] = useState<"error" | "success">("error");
  const [loading, setLoading] = useState(false);

  const handleModeChange = (next: AuthMode) => {
    setAuthMode(next);
    setErrors({});
    setStatus("");
    setStatusVariant("error");
    setLoading(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});
    setStatus("");
    setStatusVariant("error");

    const formData = new FormData(event.currentTarget);
    const values = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
    };

    const fieldErrors = validateAuthFields(authMode, values);
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      const result =
        authMode === "register"
          ? await authApi.register(values)
          : await authApi.login({ email: values.email, password: values.password });

      // Drop any cached data from a previously signed-in session before priming the new user.
      queryClient.clear();
      queryClient.setQueryData(queryKeys.currentUser, result.user);

      navigate("/today", { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        const payload = error.payload ?? {};
        setErrors(payload.errors ?? {});
        setStatus(payload.message ?? "");
      } else {
        setStatus("Could not reach the auth server.");
      }
      setStatusVariant("error");
    } finally {
      setLoading(false);
    }
  };

  const isRegister = authMode === "register";

  return (
    <main key="auth" className="sprout-auth">
      <div className="sprout-auth__left">
        <SoftLoginModal
          mode={authMode}
          loading={loading}
          onModeChange={handleModeChange}
          onSubmit={handleSubmit}
          errors={errors}
          status={status}
          statusVariant={statusVariant}
          loginTitle="Welcome back"
          loginSubmitLabel="Log in"
          subtitle={
            isRegister
              ? "Create your account to start planning."
              : "Log in to continue planning your days."
          }
          withFieldIcons
          secondaryAction={
            <button type="button" className="sprout-auth__google">
              <GoogleMark className="sprout-auth__google-mark" />
              Continue with Google
            </button>
          }
        />
      </div>

      <div className="sprout-auth__right" aria-hidden="true">
        <h2 className="sprout-auth__headline">
          <span className="sprout-auth__headline-line">
            <span className="sprout-auth__headline-word sprout-auth__headline-word--plan">Plan</span>{" "}
            <span className="sprout-auth__headline-word sprout-auth__headline-word--peacefully">
              peacefully
            </span>
          </span>
          <span className="sprout-auth__headline-line">
            <span className="sprout-auth__headline-word sprout-auth__headline-word--with">with</span>
            <span className="sprout-auth__headline-word sprout-auth__headline-word--sprout">Inchy</span>
          </span>
        </h2>
      </div>
    </main>
  );
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.04 12.26c0-.82-.07-1.6-.21-2.36H12v4.46h6.19a5.3 5.3 0 0 1-2.3 3.48v2.9h3.72c2.18-2 3.43-4.96 3.43-8.48Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.1 0 5.7-1.03 7.6-2.8l-3.72-2.9c-1.03.7-2.35 1.1-3.88 1.1-2.98 0-5.5-2-6.4-4.72H1.76v2.98A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.6 14.28a7.2 7.2 0 0 1 0-4.56V6.74H1.76a12 12 0 0 0 0 10.52l3.84-2.98Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.74c1.68 0 3.2.58 4.4 1.72l3.3-3.3C17.7 1.23 15.1 0 12 0A12 12 0 0 0 1.76 6.74l3.84 2.98C6.5 6.74 9.02 4.74 12 4.74Z"
      />
    </svg>
  );
}
