import Link from "next/link";
import { GraduationCap, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 font-display text-sm font-bold text-white">
            HH
          </div>
          <span className="font-display text-lg font-semibold text-slate-900">
            Hope Horizon Academy
          </span>
        </div>
        <nav className="flex items-center gap-3">
          <Link href="/result-verification" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Verify a result
          </Link>
          <Link href="/login">
            <Button size="sm">Sign in</Button>
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-24 pt-16 text-center">
        <h1 className="font-display text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
          Results, made simple —<br className="hidden sm:block" /> for every family, at every stage.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
          A secure home for student results at Hope Horizon Academy — for students, parents,
          teachers, and school staff, all in one place.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/login">
            <Button size="lg">Sign in to your account</Button>
          </Link>
          <Link href="/result-verification">
            <Button size="lg" variant="secondary">
              Verify a result
            </Button>
          </Link>
        </div>

        <div className="mt-20 grid gap-5 sm:grid-cols-3">
          <Card className="text-left">
            <GraduationCap className="h-6 w-6 text-brand-500" />
            <h3 className="mt-3 font-semibold text-slate-900">Every role, one portal</h3>
            <p className="mt-1 text-sm text-slate-500">
              Students, parents, teachers, and administrators each get a dashboard built for them.
            </p>
          </Card>
          <Card className="text-left">
            <ShieldCheck className="h-6 w-6 text-brand-500" />
            <h3 className="mt-3 font-semibold text-slate-900">Verified & secure</h3>
            <p className="mt-1 text-sm text-slate-500">
              Published results carry a QR code so anyone can confirm they&apos;re authentic.
            </p>
          </Card>
          <Card className="text-left">
            <Smartphone className="h-6 w-6 text-brand-500" />
            <h3 className="mt-3 font-semibold text-slate-900">Reachable anywhere</h3>
            <p className="mt-1 text-sm text-slate-500">
              Result updates reach families by email, WhatsApp, or right inside the portal.
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
