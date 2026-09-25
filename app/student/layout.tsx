import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { createClient } from "@/lib/supabase/server";
import { DashboardShellClient } from "@/components/layout/DashboardShellClient";

export default async function RoleLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: school } = await supabase
    .from("schools")
    .select("name")
    .eq("id", session.profile.school_id)
    .single();

  return (
    <DashboardShellClient
      role={session.profile.role}
      schoolName={school?.name || "Hope Horizon Academy"}
      userName={session.profile.name}
    >
      {children}
    </DashboardShellClient>
  );
}
