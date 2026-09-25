import { cn } from "@/lib/utils/cn";
import type { ResultStatus } from "@/types/enums";

const VARIANT_CLASSES = {
  neutral: "bg-slate-100 text-slate-600",
  brand: "bg-brand-50 text-brand-700",
  success: "bg-emerald-50 text-accent-600",
  warning: "bg-amber-50 text-warning-500",
  danger: "bg-red-50 text-danger-500",
} as const;

export function Badge({
  children,
  variant = "neutral",
  className,
}: {
  children: React.ReactNode;
  variant?: keyof typeof VARIANT_CLASSES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        VARIANT_CLASSES[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

const RESULT_STATUS_VARIANT: Record<ResultStatus, keyof typeof VARIANT_CLASSES> = {
  DRAFT: "neutral",
  SUBMITTED: "brand",
  PENDING_APPROVAL: "warning",
  APPROVED: "brand",
  PUBLISHED: "success",
  HIDDEN: "danger",
};

export function ResultStatusBadge({ status }: { status: ResultStatus }) {
  return <Badge variant={RESULT_STATUS_VARIANT[status]}>{status.replace(/_/g, " ")}</Badge>;
}
