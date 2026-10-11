import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/** RPCs are declared by migration 0005; keep the generated DB types aligned. */
export type PortalClient = SupabaseClient<Database>;
export type PortalAssignment = { classId: string; subjectId: string };
