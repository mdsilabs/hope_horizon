import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const VARIANTS = {
  info: { icon: Info, classes: "bg-brand-50 text-brand-800 border-brand-100" },
  success: { icon: CheckCircle2, classes: "bg-emerald-50 text-emerald-800 border-emerald-100" },
  warning: { icon: AlertTriangle, classes: "bg-amber-50 text-amber-800 border-amber-100" },
  danger: { icon: XCircle, classes: "bg-red-50 text-red-800 border-red-100" },
} as const;

export function Alert({
  variant = "info",
  title,
  children,
}: {
  variant?: keyof typeof VARIANTS;
  title?: string;
  children: React.ReactNode;
}) {
  const { icon: Icon, classes } = VARIANTS[variant];
  return (
    <div className={cn("flex gap-3 rounded-xl border p-4 text-sm", classes)}>
      <Icon className="mt-0.5 h-4.5 w-4.5 shrink-0" />
      <div>
        {title && <p className="font-medium">{title}</p>}
        <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>
      </div>
    </div>
  );
}
