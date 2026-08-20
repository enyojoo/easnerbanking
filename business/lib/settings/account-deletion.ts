import type { SupabaseClient } from "@supabase/supabase-js"

/** Days between delete request and account closure (auth revoked). */
export const ACCOUNT_DELETION_GRACE_DAYS = 7

/** Max users closed per cron run. */
export const ACCOUNT_DELETION_CRON_BATCH = 50

export type AccountDeletionState = "active" | "pending" | "closed"

export type AccountDeletionRow = {
  deletion_scheduled_at: string | null
  deleted_at: string | null
}

export function getAccountDeletionState(row: AccountDeletionRow | null | undefined): AccountDeletionState {
  if (row?.deleted_at) return "closed"
  if (row?.deletion_scheduled_at) return "pending"
  return "active"
}

export const ACCOUNT_CLOSED_MESSAGE =
  "This account has been closed. Contact support@easner.com if you need help restoring access."

export function deletionScheduledAtFromNow(now = new Date()): Date {
  const at = new Date(now.getTime())
  at.setUTCDate(at.getUTCDate() + ACCOUNT_DELETION_GRACE_DAYS)
  return at
}

/**
 * Schedule account closure after the grace period. Does not remove auth or profile yet.
 */
export async function scheduleAccountDeletion(
  admin: SupabaseClient,
  userId: string,
): Promise<{ deletion_scheduled_at: string }> {
  const { data: existing, error: readErr } = await admin
    .from("users")
    .select("deleted_at")
    .eq("id", userId)
    .maybeSingle()

  if (readErr) {
    throw new Error(readErr.message || "Unable to schedule account deletion.")
  }
  if (existing?.deleted_at) {
    throw new Error("This account is already closed.")
  }

  const at = deletionScheduledAtFromNow().toISOString()
  const { data, error } = await admin
    .from("users")
    .update({ deletion_scheduled_at: at, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle()

  if (error) {
    throw new Error(error.message || "Unable to schedule account deletion.")
  }
  if (!data?.id) {
    throw new Error("Unable to schedule account deletion. Profile not found.")
  }

  return { deletion_scheduled_at: at }
}

/** Clear a pending deletion (e.g. user signed back in). Idempotent. */
export async function cancelAccountDeletion(admin: SupabaseClient, userId: string): Promise<void> {
  const { data: existing, error: readErr } = await admin
    .from("users")
    .select("deleted_at")
    .eq("id", userId)
    .maybeSingle()

  if (readErr) {
    throw new Error(readErr.message || "Unable to cancel account deletion.")
  }
  if (existing?.deleted_at) {
    throw new Error("This account is already closed and cannot be cancelled.")
  }

  const { error } = await admin
    .from("users")
    .update({ deletion_scheduled_at: null, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .not("deletion_scheduled_at", "is", null)

  if (error) {
    throw new Error(error.message || "Unable to cancel account deletion.")
  }
}

/** Clear closed state (support restore). Idempotent. */
export async function restoreClosedAccount(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin
    .from("users")
    .update({
      deleted_at: null,
      deletion_scheduled_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .not("deleted_at", "is", null)

  if (error) {
    throw new Error(error.message || "Unable to restore closed account.")
  }
}

/**
 * Finalize account closure after grace period: mark closed, revoke push tokens, delete auth only.
 * Profile and related records are retained for compliance / recovery.
 */
export async function finalizeAccountClosure(
  admin: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  const nowIso = now.toISOString()

  const { data: row, error: updateErr } = await admin
    .from("users")
    .update({
      deleted_at: nowIso,
      deletion_scheduled_at: null,
      updated_at: nowIso,
    })
    .eq("id", userId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle()

  if (updateErr) {
    return { ok: false, error: updateErr.message || "Unable to close account." }
  }
  if (!row?.id) {
    // Already closed or missing profile – still attempt auth/push cleanup below.
  }

  await admin.from("user_push_devices").delete().eq("user_id", userId)

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) {
    const msg = (error.message || "").toLowerCase()
    // Idempotency: if the auth user is already gone, treat as success.
    if (msg.includes("not found") || msg.includes("user not found")) {
      return { ok: true }
    }
    return { ok: false, error: error.message || "Unable to revoke account access." }
  }

  return { ok: true }
}

/**
 * Close accounts whose grace period has ended.
 */
export async function processDueAccountClosures(
  admin: SupabaseClient,
  options?: { limit?: number; now?: Date },
): Promise<{ processed: number; closed: number; failed: number; errors: string[] }> {
  const limit = options?.limit ?? ACCOUNT_DELETION_CRON_BATCH
  const now = options?.now ?? new Date()
  const nowIso = now.toISOString()

  const { data: rows, error: listErr } = await admin
    .from("users")
    .select("id")
    .not("deletion_scheduled_at", "is", null)
    .is("deleted_at", null)
    .lte("deletion_scheduled_at", nowIso)
    .order("deletion_scheduled_at", { ascending: true })
    .limit(limit)

  if (listErr) {
    throw new Error(listErr.message || "Unable to list accounts due for closure.")
  }

  const due = rows ?? []
  let closed = 0
  let failed = 0
  const errors: string[] = []

  for (const row of due) {
    const id = typeof row.id === "string" ? row.id : ""
    if (!id) continue
    const result = await finalizeAccountClosure(admin, id, now)
    if (result.ok) {
      closed += 1
    } else {
      failed += 1
      errors.push(`${id}: ${result.error}`)
      console.error("processDueAccountClosures: failed", id, result.error)
    }
  }

  return { processed: due.length, closed, failed, errors }
}
