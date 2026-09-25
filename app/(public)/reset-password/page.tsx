"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { passwordSchema } from "@/lib/validations/common";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

const schema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
type FormInput = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormInput) {
    setServerError(null);
    // The recovery link Supabase emailed the user already established a
    // temporary session in the browser (via the URL fragment) before this
    // page mounted, so we can update the password directly.
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: data.newPassword });

    if (error) {
      setServerError(error.message || "Unable to reset your password. The link may have expired.");
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push("/login"), 2000);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 font-display text-sm font-bold text-white">
            HH
          </div>
          <h1 className="mt-4 font-display text-xl font-semibold text-slate-900">Choose a new password</h1>
        </div>

        <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
          {success ? (
            <Alert variant="success" title="Password updated">
              Redirecting you to sign in...
            </Alert>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {serverError && <Alert variant="danger">{serverError}</Alert>}
              <Input
                label="New password"
                type="password"
                autoComplete="new-password"
                error={errors.newPassword?.message}
                {...register("newPassword")}
              />
              <Input
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                error={errors.confirmPassword?.message}
                {...register("confirmPassword")}
              />
              <Button type="submit" fullWidth isLoading={isSubmitting}>
                Update password
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
