import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  SoftLoginModal,
  validateAuthFields,
  type AuthMode,
} from "../../../components/SoftLoginModal";
import { ApiError } from "../../shared/api/client";
import { queryKeys } from "../../shared/api/queryClient";
import { pageTransition } from "../../app/sidebar";
import * as authApi from "./api";
import type { AuthErrors } from "./api";

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

    try {
      const result =
        authMode === "register"
          ? await authApi.register(values)
          : await authApi.login({ email: values.email, password: values.password });

      // Drop any cached data from a previously signed-in session before priming the new user.
      queryClient.clear();
      queryClient.setQueryData(queryKeys.currentUser, result.user);

      if (authMode === "login") {
        setLoading(true);
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }

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

  return (
    <motion.main key="auth" className="auth-stage" {...pageTransition}>
      <SoftLoginModal
        mode={authMode}
        loading={loading}
        onModeChange={handleModeChange}
        onSubmit={handleSubmit}
        errors={errors}
        status={status}
        statusVariant={statusVariant}
      />
    </motion.main>
  );
}
