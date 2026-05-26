import type { createSupabaseAdmin } from "@/lib/supabase/admin"
import type { TxRow } from "./office-overview-compute"

type AdminClient = ReturnType<typeof createSupabaseAdmin>

type UserProfileRow = {
  id: string
  email?: string | null
  full_name?: string | null
}

/**
 * Loads transactions in a time window and attaches user display fields without a PostgREST embed
 * (avoids "Could not find a relationship between 'transactions' and 'users'" when no FK is exposed).
 */
export async function loadTransactionsForOverview(
  admin: AdminClient,
  sinceIso: string,
  untilIso: string,
  limit: number,
): Promise<{ data: TxRow[]; error: { message: string } | null }> {
  const fetchLimit = Math.min(limit * 3, 1500)
  const txRes = await admin
    .from("transactions")
    .select(
      "id, created_at, updated_at, occurred_at, status, currency, amount, direction, user_id, provider, metadata, payload, base_currency, base_amount, easner_transaction_id",
    )
    .gte("created_at", sinceIso)
    .lte("created_at", untilIso)
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(fetchLimit)

  if (txRes.error) {
    return { data: [], error: txRes.error }
  }

  const sinceMs = new Date(sinceIso).getTime()
  const untilMs = new Date(untilIso).getTime()
  const rows = ((txRes.data || []) as Omit<TxRow, "user">[]).filter((t) => {
    const at = t.occurred_at || t.created_at
    if (!at) return false
    const ms = new Date(at).getTime()
    return Number.isFinite(ms) && ms >= sinceMs && ms <= untilMs
  }).slice(0, limit)
  const userIds = [...new Set(rows.map((t) => t.user_id).filter((id): id is string => Boolean(id)))]

  const userById = new Map<string, UserProfileRow>()

  if (userIds.length > 0) {
    const { data: profiles, error: profErr } = await admin.from("users").select("id, email, full_name").in("id", userIds)

    if (profErr) {
      console.error("office overview users batch:", profErr)
    }

    for (const raw of profiles || []) {
      const u = raw as UserProfileRow
      if (u?.id) userById.set(String(u.id), u)
    }
  }

  const data: TxRow[] = rows.map((t) => {
    const uid = t.user_id ? String(t.user_id) : ""
    const p = uid ? userById.get(uid) : undefined
    return {
      ...t,
      user: p
        ? {
            first_name: null,
            last_name: null,
            email: p.email ?? null,
            full_name: p.full_name ?? null,
          }
        : null,
    }
  })

  return { data, error: null }
}
