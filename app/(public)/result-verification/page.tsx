"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { LoadingState } from "@/components/ui/States";
import { Card } from "@/components/ui/Card";

interface VerificationResult {
  valid: boolean;
  studentName?: string;
  className?: string;
  termName?: string;
  sessionName?: string;
  overallAverage?: number;
  schoolName?: string;
}

function VerificationContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(!!code);

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    fetch(`/api/results/verify?code=${encodeURIComponent(code)}`)
      .then((res) => res.json())
      .then((data) => setResult(data))
      .catch(() => setResult({ valid: false }))
      .finally(() => setLoading(false));
  }, [code]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 font-display text-sm font-bold text-white">
            HH
          </div>
          <h1 className="mt-4 font-display text-xl font-semibold text-slate-900">
            Result verification
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Confirming the authenticity of a Hope Horizon Academy result.
          </p>
        </div>

        <Card>
          {!code && (
            <p className="text-center text-sm text-slate-500">
              Scan a result&apos;s QR code, or open the verification link printed on the result
              sheet, to confirm it here.
            </p>
          )}
          {code && loading && <LoadingState label="Verifying result..." />}
          {code && !loading && result && (
            <div className="text-center">
              {result.valid ? (
                <>
                  <CheckCircle2 className="mx-auto h-10 w-10 text-accent-500" />
                  <p className="mt-3 font-medium text-slate-900">This result is genuine</p>
                  <dl className="mt-4 space-y-2 text-left text-sm">
                    <div className="flex justify-between border-b border-surface-border pb-2">
                      <dt className="text-slate-500">Student</dt>
                      <dd className="font-medium text-slate-800">{result.studentName}</dd>
                    </div>
                    <div className="flex justify-between border-b border-surface-border pb-2">
                      <dt className="text-slate-500">Class</dt>
                      <dd className="font-medium text-slate-800">{result.className}</dd>
                    </div>
                    <div className="flex justify-between border-b border-surface-border pb-2">
                      <dt className="text-slate-500">Session / Term</dt>
                      <dd className="font-medium text-slate-800">
                        {result.sessionName} — {result.termName}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">School</dt>
                      <dd className="font-medium text-slate-800">{result.schoolName}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <>
                  <XCircle className="mx-auto h-10 w-10 text-danger-500" />
                  <p className="mt-3 font-medium text-slate-900">
                    We couldn&apos;t verify this result
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    This code may be invalid, expired, or the result may have been withdrawn.
                    Contact the school directly if you believe this is an error.
                  </p>
                </>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function ResultVerificationPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <VerificationContent />
    </Suspense>
  );
}
