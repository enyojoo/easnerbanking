import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function logAdminAction(
  adminUserId: string,
  action: string,
  resource: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const admin = createSupabaseAdmin()
    await admin.from("admin_audit_log").insert({
      admin_user_id: adminUserId,
      action,
      resource,
      metadata: metadata ?? null,
    })
  } catch (e) {
    console.error("admin_audit_log insert failed:", e)
  }
}
