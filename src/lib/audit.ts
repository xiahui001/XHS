import { createSupabaseServerClient } from "./supabase/server";

export type AuditObjectType =
  | "account"
  | "hotspot_ref"
  | "material"
  | "generation_job"
  | "draft"
  | "conversation"
  | "lead"
  | "prompt";

export type AuditLogInput = {
  objectType: AuditObjectType;
  objectId: string;
  action: string;
  summary: string;
  afterSnapshot?: unknown;
};

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return;
  }

  await supabase.from("audit_logs").insert({
    object_type: input.objectType,
    object_id: input.objectId,
    action: input.action,
    summary: input.summary,
    after_snapshot: input.afterSnapshot ?? null
  });
}
