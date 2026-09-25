"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Card, CardHeader } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

export function ApprovalActions({ resultId, backHref }: { resultId: string; backHref: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [remarks, setRemarks] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: "APPROVE" | "REJECT") {
    setError(null);
    if (action === "REJECT" && !rejectionReason.trim()) {
      setError("Add a short reason so the teacher knows what to correct.");
      return;
    }

    setIsBusy(true);
    try {
      const res = await fetch(`/api/results/${resultId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "APPROVE" ? { action, principalRemarks: remarks || undefined } : { action, rejectionReason }
        ),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message || "Unable to record this decision.");
        return;
      }
      showToast(action === "APPROVE" ? "Result approved." : "Result sent back for correction.", "success");
      router.push(backHref);
      router.refresh();
    } catch {
      setError("Unable to reach the server. Please check your connection and try again.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Approval decision" description="This result is awaiting your review." />
      {error && <Alert variant="danger">{error}</Alert>}

      {!showRejectForm ? (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Remarks (optional, shown on the published result)
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full rounded-xl border border-surface-border bg-white px-3.5 py-2.5 text-sm text-slate-800 focus-ring"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => decide("APPROVE")} isLoading={isBusy} variant="success">
              <CheckCircle2 className="h-4 w-4" />
              Approve
            </Button>
            <Button onClick={() => setShowRejectForm(true)} variant="danger" disabled={isBusy}>
              <XCircle className="h-4 w-4" />
              Send back for correction
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              What needs to be corrected?
            </label>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. The exam score for Mathematics looks too high — please double-check."
              className="w-full rounded-xl border border-surface-border bg-white px-3.5 py-2.5 text-sm text-slate-800 focus-ring"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => decide("REJECT")} isLoading={isBusy} variant="danger">
              Confirm and send back
            </Button>
            <Button variant="ghost" onClick={() => setShowRejectForm(false)} disabled={isBusy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
