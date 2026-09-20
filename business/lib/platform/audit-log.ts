import type { SupabaseClient } from "@supabase/supabase-js"

export type PlatformAuditAction =
  | "key.created"
  | "key.revoked"
  | "webhook_endpoint.created"
  | "webhook_endpoint.updated"
  | "webhook_endpoint.disabled"

/** Fire-and-forget — an audit-log write failure must never block the real action. */
export function recordPlatformAudit(
  admin: SupabaseClient,
  input: {
    businessId: string
    actorUserId: string
    action: PlatformAuditAction
    targetType: string
    targetId?: string | null
    metadata?: Record<string, unknown>
  },
): void {
  void admin
    .from("platform_audit_log")
    .insert({
      business_id: input.businessId,
      actor_user_id: input.actorUserId,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId ?? null,
      metadata: input.metadata ?? {},
    })
    .then(({ error }) => {
      if (error) console.warn("[platform] audit log write failed:", error.message)
    })
}
