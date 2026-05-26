import type { createSupabaseAdmin } from "@/lib/supabase/admin"

type AdminClient = ReturnType<typeof createSupabaseAdmin>

export const OFFICE_LEDGER_TX_SELECT =
  "id, user_id, business_id, provider, provider_transaction_id, provider_event_id, easner_transaction_id, status, amount, currency, direction, metadata, payload, created_at, updated_at, occurred_at, settled_at, tx_hash, wallet_address, asset, chain, counterparty_address, base_currency, base_amount, fx_rate, fx_rate_as_of"

export type OfficeLedgerTransaction = {
  id: string
  user_id: string | null
  business_id: string | null
  provider: string
  provider_transaction_id: string | null
  provider_event_id: string | null
  easner_transaction_id: string | null
  status: string
  amount: number | null
  currency: string | null
  direction: string | null
  metadata: Record<string, unknown> | null
  payload: Record<string, unknown> | null
  created_at: string
  updated_at: string | null
  occurred_at: string | null
  settled_at: string | null
  tx_hash: string | null
  wallet_address: string | null
  asset: string | null
  chain: string | null
  counterparty_address: string | null
  base_currency: string | null
  base_amount: number | null
  fx_rate: number | null
  fx_rate_as_of: string | null
  user?: {
    email: string | null
    full_name: string | null
    first_name: string
    last_name: string
  } | null
}

type UserProfileRow = {
  id: string
  email?: string | null
  full_name?: string | null
}

function splitFullName(fullName: string | null | undefined): { first_name: string; last_name: string } {
  const full = String(fullName || "").trim()
  const parts = full ? full.split(/\s+/) : []
  return {
    first_name: parts[0] || "",
    last_name: parts.length > 1 ? parts.slice(1).join(" ") : "",
  }
}

function attachUserProfiles(
  rows: Omit<OfficeLedgerTransaction, "user">[],
  profiles: UserProfileRow[] | null | undefined,
): OfficeLedgerTransaction[] {
  const userById = new Map<string, UserProfileRow>()
  for (const raw of profiles || []) {
    if (raw?.id) userById.set(String(raw.id), raw)
  }
  return rows.map((t) => {
    const uid = t.user_id ? String(t.user_id) : ""
    const p = uid ? userById.get(uid) : undefined
    const names = splitFullName(p?.full_name)
    return {
      ...t,
      user: p
        ? {
            email: p.email ?? null,
            full_name: p.full_name ?? null,
            first_name: names.first_name,
            last_name: names.last_name,
          }
        : null,
    }
  })
}

export async function loadOfficeLedgerTransactions(
  admin: AdminClient,
  opts: { userId?: string; limit?: number } = {},
): Promise<{ data: OfficeLedgerTransaction[]; error: { message: string } | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500)
  let q = admin.from("transactions").select(OFFICE_LEDGER_TX_SELECT).order("occurred_at", { ascending: false, nullsFirst: false })

  if (opts.userId) {
    q = q.eq("user_id", opts.userId)
  }

  const txRes = await q.limit(limit)

  if (txRes.error) {
    return { data: [], error: txRes.error }
  }

  const rows = (txRes.data || []) as Omit<OfficeLedgerTransaction, "user">[]
  const userIds = [...new Set(rows.map((t) => t.user_id).filter((id): id is string => Boolean(id)))]

  if (userIds.length === 0) {
    return { data: rows.map((t) => ({ ...t, user: null })), error: null }
  }

  const { data: profiles, error: profErr } = await admin.from("users").select("id, email, full_name").in("id", userIds)

  if (profErr) {
    console.error("office transactions users batch:", profErr)
  }

  return { data: attachUserProfiles(rows, profiles), error: null }
}
