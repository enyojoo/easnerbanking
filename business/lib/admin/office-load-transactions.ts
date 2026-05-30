import type { createSupabaseAdmin } from "@/lib/supabase/admin"
import { OFFICE_LEDGER_LIST_SELECT } from "@/lib/ledger/ledger-select"

type AdminClient = ReturnType<typeof createSupabaseAdmin>

/** @deprecated Use OFFICE_LEDGER_LIST_SELECT — no payload on list reads. */
export const OFFICE_LEDGER_TX_SELECT = OFFICE_LEDGER_LIST_SELECT

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
  payload?: Record<string, unknown> | null
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
  user?: {
    email: string | null
    full_name: string | null
    first_name: string
    last_name: string
  } | null
  business?: {
    id: string
    name: string | null
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

type BusinessRow = {
  id: string
  name?: string | null
}

function attachAccountProfiles(
  rows: Omit<OfficeLedgerTransaction, "user" | "business">[],
  profiles: UserProfileRow[] | null | undefined,
  businesses: BusinessRow[] | null | undefined,
): OfficeLedgerTransaction[] {
  const userById = new Map<string, UserProfileRow>()
  for (const raw of profiles || []) {
    if (raw?.id) userById.set(String(raw.id), raw)
  }
  const businessById = new Map<string, BusinessRow>()
  for (const raw of businesses || []) {
    if (raw?.id) businessById.set(String(raw.id), raw)
  }
  return rows.map((t) => {
    const uid = t.user_id ? String(t.user_id) : ""
    const p = uid ? userById.get(uid) : undefined
    const names = splitFullName(p?.full_name)
    const bid = t.business_id ? String(t.business_id) : ""
    const biz = bid ? businessById.get(bid) : undefined
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
      business: biz
        ? {
            id: String(biz.id),
            name: biz.name ?? null,
          }
        : null,
    }
  })
}

export async function loadOfficeLedgerTransactions(
  admin: AdminClient,
  opts: { userId?: string; limit?: number } = {},
): Promise<{ data: OfficeLedgerTransaction[]; error: { message: string } | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 150)
  let q = admin
    .from("transactions")
    .select(OFFICE_LEDGER_LIST_SELECT)
    .eq("hidden_from_feed", false)
    .order("occurred_at", { ascending: false, nullsFirst: false })

  if (opts.userId) {
    q = q.eq("user_id", opts.userId)
  }

  const txRes = await q.limit(limit)

  if (txRes.error) {
    return { data: [], error: txRes.error }
  }

  const rows = (txRes.data || []) as Omit<OfficeLedgerTransaction, "user" | "business">[]
  const userIds = [...new Set(rows.map((t) => t.user_id).filter((id): id is string => Boolean(id)))]
  const businessIds = [...new Set(rows.map((t) => t.business_id).filter((id): id is string => Boolean(id)))]

  let profiles: UserProfileRow[] | null = null
  if (userIds.length > 0) {
    const { data, error: profErr } = await admin.from("users").select("id, email, full_name").in("id", userIds)
    if (profErr) {
      console.error("office transactions users batch:", profErr)
    }
    profiles = (data || []) as UserProfileRow[]
  }

  let businesses: BusinessRow[] | null = null
  if (businessIds.length > 0) {
    const { data, error: bizErr } = await admin.from("businesses").select("id, name").in("id", businessIds)
    if (bizErr) {
      console.error("office transactions businesses batch:", bizErr)
    }
    businesses = (data || []) as BusinessRow[]
  }

  return { data: attachAccountProfiles(rows, profiles, businesses), error: null }
}
