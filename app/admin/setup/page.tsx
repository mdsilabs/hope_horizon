import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight, School, Rocket } from "lucide-react";
import { requireRole } from "@/lib/auth/requireSession";
import { readSchoolSetup } from "@/lib/admin/read-school-setup";

export default async function SchoolSetupPage() {
  const session = await requireRole(["ADMIN"]);
  const setup = await readSchoolSetup(session.profile.school_id);
  const next = setup.steps.find(step => !step.done);
  const progress = Math.round(setup.complete / setup.total * 100);

  return <div className="mx-auto max-w-4xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-brand-600">Administrator onboarding</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-slate-900">School setup center</h1>
        <p className="mt-2 text-sm text-slate-600">
          Follow these steps to prepare {setup.schoolName} for result entry.
          Everything is saved as you work, so you can return any time.
        </p>
      </div>
      <span className="inline-flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700">
        <School className="h-4 w-4"/> {setup.complete} of {setup.total} completed
      </span>
    </div>

    <section className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm" aria-label="Setup progress">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">{setup.ready ? "Ready for everyday use" : "Your setup progress"}</h2>
        <span className="text-sm font-semibold text-brand-700">{progress}%</span>
      </div>
      <div role="progressbar" aria-valuenow={setup.complete} aria-valuemin={0}
        aria-valuemax={setup.total} aria-label="School setup completion"
        className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{width:`${progress}%`}}/>
      </div>
      <p className="mt-3 text-sm text-slate-500">
        {setup.ready
          ? "The minimum setup milestones are complete. Review integrations before publishing real results."
          : "Complete the remaining items. Each status is calculated from your school's actual records."}
      </p>
      {next ? <Link href={next.href}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">
        Continue: {next.title} <ArrowRight className="h-4 w-4"/>
      </Link> : <Link href="/admin/integrations"
        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-surface-border px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-surface-muted">
        Check integrations <ArrowRight className="h-4 w-4"/>
      </Link>}
    </section>

    <div className="grid gap-3 sm:grid-cols-2">
      {setup.steps.map((step, index) => <Link key={step.key} href={step.href}
        className="group flex min-h-32 items-start gap-3 rounded-2xl border border-surface-border bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md">
        {step.done
          ? <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-600"/>
          : <Circle className="mt-1 h-5 w-5 shrink-0 text-slate-300"/>}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">Step {index + 1} · {step.done ? "Completed" : "Needs attention"}</p>
          <h3 className="mt-1 font-semibold text-slate-900">{step.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">{step.description}</p>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
            {step.done ? "Review" : "Set up"} <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5"/>
          </span>
        </div>
      </Link>)}
    </div>
    <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
      <Rocket className="h-5 w-5 shrink-0"/>
      <p>Setup completion is a guide, not proof that authentication emails, database security and result
        publishing have passed live checks. Before inviting staff, visit <Link className="font-semibold underline"
        href="/admin/integrations">Integration diagnostics</Link>.</p>
    </div>
  </div>;
}
