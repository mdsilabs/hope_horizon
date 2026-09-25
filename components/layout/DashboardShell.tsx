"use client";

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { UserRole } from "@/types/enums";

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrator",
  TEACHER: "Teacher",
  STUDENT: "Student",
  PARENT: "Parent",
  PRINCIPAL: "Principal",
  VICE_PRINCIPAL: "Vice Principal",
  ACCOUNTANT: "Accountant",
  OTHER: "User",
};

export function DashboardShell({
  role,
  schoolName,
  userName,
  unreadCount,
  onLogout,
  children,
}: {
  role: UserRole;
  schoolName: string;
  userName: string;
  unreadCount?: number;
  onLogout?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar role={role} schoolName={schoolName} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar
          userName={userName}
          roleLabel={ROLE_LABELS[role]}
          unreadCount={unreadCount}
          onLogout={onLogout}
        />
        <main className="flex-1 bg-surface-muted p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
