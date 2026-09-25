"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Card, CardHeader } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import type { ResultStatus } from "@/types/database";

export function PublishHideActions({
  resultId,
  status,
  backHref,
  canHide,
}: {
  resultId: string;
  status: ResultStatus;
  backHref: string;
  canHide: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "publish" | "hide") {
    setError(null);
    setIsBusy(true);
    try {
      const res = await fetch(`/api/results/${resultId}/${action}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message || `Unable to ${action} this result.`);
        return;
      }
      showToast(action === "publish" ? "Result published." : "Result hidden.", "success");
      router.push(backHref);
      router.refresh();
    } catch {
      setError("Unable to reach the server. Please check your connection and try again.");
    } finally {
      setIsBusy(false);
    }
  }

  if (status !== "APPROVED" && !(status === "PUBLISHED" && canHide)) return null;

  return (
    <Card>
      <CardHeader
        title={status === "APPROVED" ? "Ready to publish" : "Published result"}
        description={
          status === "APPROVED"
            ? "Publishing makes this result visible to the student and their parents, and generates its QR verification code."
            : "Hiding a published result retracts it from student/parent view without deleting its history."
        }
      />
      {error && <Alert variant="danger">{error}</Alert>}
      <div className="flex flex-wrap gap-3">
        {status === "APPROVED" && (
          <Button onClick={() => run("publish")} isLoading={isBusy}>
            <Send className="h-4 w-4" />
            Publish result
          </Button>
        )}
        {status === "PUBLISHED" && canHide && (
          <Button onClick={() => run("hide")} isLoading={isBusy} variant="danger">
            <EyeOff className="h-4 w-4" />
            Hide result
          </Button>
        )}
      </div>
    </Card>
  );
}
