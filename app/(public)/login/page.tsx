"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || undefined;
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: LoginInput) {
    setServerError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json?.error?.message || "Unable to sign in. Please try again.");
        return;
      }
      router.push(redirectTo || json.homeRoute || "/");
      router.refresh();
    } catch {
      setServerError("Unable to reach the server. Please check your connection and try again.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 font-display text-sm font-bold text-white">
            HH
          </div>
          <h1 className="mt-4 font-display text-xl font-semibold text-slate-900">
            Sign in to your portal
          </h1>
          <p className="mt-1 text-sm text-slate-500">Hope Horizon Academy Results Portal</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-2xl border border-surface-border bg-white p-6 shadow-card">
          {serverError && <Alert variant="danger">{serverError}</Alert>}
          <Input
            label="Email address"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register("email")}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password")}
          />
          <Button type="submit" fullWidth isLoading={isSubmitting}>
            Sign in
          </Button>
          <div className="flex items-center justify-between text-sm">
            <Link href="/forgot-password" className="text-brand-600 hover:underline">
              Forgot password?
            </Link>
            <Link href="/result-verification" className="text-slate-500 hover:underline">
              Verify a result
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}


export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
          <p className="text-sm text-slate-500">Loading sign in…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
