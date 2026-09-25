import { FileQuestion, Loader2, ServerCrash } from "lucide-react";
import { Button } from "./Button";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
      <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  description,
  action,
  icon,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-surface-border py-16 text-center">
      <div className="mb-1 rounded-full bg-surface-muted p-3 text-slate-400">
        {icon ?? <FileQuestion className="h-6 w-6" />}
      </div>
      <p className="font-medium text-slate-700">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "Please try again. If the problem continues, contact the school administrator.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-red-100 bg-red-50/50 py-16 text-center">
      <div className="mb-1 rounded-full bg-red-100 p-3 text-danger-500">
        <ServerCrash className="h-6 w-6" />
      </div>
      <p className="font-medium text-slate-800">{title}</p>
      <p className="max-w-sm text-sm text-slate-500">{description}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
