"use client";

import { useRouter } from "next/navigation";
import { DashboardShell } from "./DashboardShell";
import type { UserRole } from "@/types/enums";

export function DashboardShellClient({
  role,
  schoolName,
  userName,
  children,
}: {
  role: UserRole;
  schoolName: string;
  userName: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <DashboardShell role={role} schoolName={schoolName} userName={userName} onLogout={handleLogout}>
      {children}
    </DashboardShell>
  );
}
