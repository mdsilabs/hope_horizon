"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  ClipboardCheck,
  Bell,
  Settings,
  UserCircle,
  FileCheck2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { UserRole } from "@/types/enums";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  ADMIN: [
    { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
    { label: "Students", href: "/admin/students", icon: GraduationCap },
    { label: "Teachers", href: "/admin/teachers", icon: Users },
    { label: "Classes & Subjects", href: "/admin/classes", icon: BookOpen },
    { label: "Results", href: "/admin/results", icon: ClipboardCheck },
    { label: "Notifications", href: "/admin/notifications", icon: Bell },
    { label: "Settings", href: "/admin/settings", icon: Settings },
  ],
  PRINCIPAL: [
    { label: "Dashboard", href: "/principal", icon: LayoutDashboard },
    { label: "Approvals", href: "/principal/approvals", icon: FileCheck2 },
    { label: "Results Overview", href: "/principal/results", icon: ClipboardCheck },
    { label: "Notifications", href: "/principal/notifications", icon: Bell },
  ],
  VICE_PRINCIPAL: [
    { label: "Dashboard", href: "/vice-principal", icon: LayoutDashboard },
    { label: "Approvals", href: "/vice-principal/approvals", icon: FileCheck2 },
    { label: "Results Overview", href: "/vice-principal/results", icon: ClipboardCheck },
    { label: "Notifications", href: "/vice-principal/notifications", icon: Bell },
  ],
  TEACHER: [
    { label: "Dashboard", href: "/teacher", icon: LayoutDashboard },
    { label: "My Classes", href: "/teacher/classes", icon: BookOpen },
    { label: "Enter Results", href: "/teacher/results", icon: ClipboardCheck },
    { label: "Notifications", href: "/teacher/notifications", icon: Bell },
  ],
  STUDENT: [
    { label: "Dashboard", href: "/student", icon: LayoutDashboard },
    { label: "My Results", href: "/student/results", icon: ClipboardCheck },
    { label: "Notifications", href: "/student/notifications", icon: Bell },
    { label: "Profile", href: "/student/profile", icon: UserCircle },
  ],
  PARENT: [
    { label: "Dashboard", href: "/parent", icon: LayoutDashboard },
    { label: "My Children", href: "/parent/children", icon: GraduationCap },
    { label: "Results", href: "/parent/results", icon: ClipboardCheck },
    { label: "Notifications", href: "/parent/notifications", icon: Bell },
  ],
  ACCOUNTANT: [
    { label: "Dashboard", href: "/accountant", icon: LayoutDashboard },
    { label: "Students", href: "/accountant/students", icon: GraduationCap },
    { label: "Billing", href: "/accountant/billing", icon: Wallet },
    { label: "Notifications", href: "/accountant/notifications", icon: Bell },
  ],
  OTHER: [{ label: "Dashboard", href: "/", icon: LayoutDashboard }],
};

export function Sidebar({ role, schoolName }: { role: UserRole; schoolName: string }) {
  const pathname = usePathname();
  const items = NAV_BY_ROLE[role];

  return (
    <aside className="hidden w-64 shrink-0 border-r border-surface-border bg-white md:flex md:flex-col">
      <div className="flex items-center gap-2.5 border-b border-surface-border px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 font-display text-sm font-bold text-white">
          HH
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight text-slate-900">{schoolName}</p>
          <p className="text-xs text-slate-500">Results Portal</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-surface-muted hover:text-slate-900"
              )}
            >
              <Icon className="h-4.5 w-4.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
