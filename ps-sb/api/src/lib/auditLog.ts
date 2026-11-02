import { getSupabaseAdmin } from "./supabase.js";

export async function writeAuditLog({
  actorId,
  action,
  entityType,
  entityId,
  summary,
  metadata = {},
}: {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await getSupabaseAdmin().from("audit_logs").insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata: { ...metadata, summary },
  });
  if (error) throw new Error(`Unable to record audit event "${action}": ${error.message}`);
}
