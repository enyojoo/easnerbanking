import type { createSupabaseAdmin } from "@/lib/supabase/admin"
import { OFFICE_LEDGER_LIST_SELECT } from "@/lib/ledger/ledger-select"

type AdminClient = ReturnType<typeof createSupabaseAdmin>

/** @deprecated Use OFFICE_LEDGER_LIST_SELECT – no payload on list reads. */
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

export type OfficeLedgerLoadFilters = {
  userId?: string
  businessId?: string
  provider?: string
  ycMode?: string
  rail?: string
  status?: string
  cursor?: string
  limit?: number
}

export type OfficeLedgerLoadResult = {
  data: OfficeLedgerTransaction[]
  nextCursor: string | null
  error: { message: string } | null
}

function normalizeProviderFilter(raw: string | undefined): string | null {
  const value = String(raw ?? "").trim().toLowerCase()
  if (!value || value === "all") return null
  return value
}

function normalizeYcModeFilter(raw: string | undefined): string | null {
  const value = String(raw ?? "").trim()
  if (!value || value === "all") return null
  if (value === "fund_balance" || value === "cross_border_send" || value === "balance_payout") {
    return value
  }
  return null
}

function normalizeRailFilter(raw: string | undefined): string | null {
  const value = String(raw ?? "").trim()
  if (!value || value === "all") return null
  if (value === "bank_transfer" || value === "mobile_money") return value
  return null
}

function normalizeStatusFilter(raw: string | undefined): string | null {
  const value = String(raw ?? "").trim().toLowerCase()
  if (!value || value === "all") return null
  return value
}

function matchesOfficeLedgerFilters(
  row: Omit<OfficeLedgerTransaction, "user" | "business">,
  filters: Omit<OfficeLedgerLoadFilters, "cursor" | "limit" | "userId">,
): boolean {
  const provider = normalizeProviderFilter(filters.provider)
  if (provider && String(row.provider ?? "").trim().toLowerCase() !== provider) return false

  const ycMode = normalizeYcModeFilter(filters.ycMode)
  if (ycMode && String(row.metadata?.yc_mode ?? "") !== ycMode) return false

  const rail = normalizeRailFilter(filters.rail)
  if (rail && String(row.metadata?.pay_in_rail ?? "") !== rail) return false

  const status = normalizeStatusFilter(filters.status)
  if (status && String(row.status ?? "").trim().toLowerCase() !== status) return false

  return true
}

function encodeOfficeLedgerCursor(row: { occurred_at: string | null; created_at: string; id: string }): string {
  return Buffer.from(
    JSON.stringify({
      occurred_at: row.occurred_at,
      created_at: row.created_at,
      id: row.id,
    }),
  ).toString("base64url")
}

function decodeOfficeLedgerCursor(raw: string | undefined): {
  occurred_at: string | null
  created_at: string
  id: string
} | null {
  const value = String(raw ?? "").trim()
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      occurred_at?: string | null
      created_at?: string
      id?: string
    }
    if (!parsed?.id || !parsed.created_at) return null
    return {
      occurred_at: parsed.occurred_at ?? null,
      created_at: parsed.created_at,
      id: parsed.id,
    }
  } catch {
    return null
  }
}

export async function loadOfficeLedgerTransactions(
  admin: AdminClient,
  opts: OfficeLedgerLoadFilters = {},
): Promise<OfficeLedgerLoadResult> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 150)
  const fetchLimit = Math.min(limit * 4, 600)
  const cursor = decodeOfficeLedgerCursor(opts.cursor)
  let q = admin
    .from("transactions")
    .select(OFFICE_LEDGER_LIST_SELECT)
    .eq("hidden_from_feed", false)
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })

  if (opts.userId) {
    q = q.eq("user_id", opts.userId)
  }
  if (opts.businessId) {
    q = q.eq("business_id", opts.businessId)
  }

  const txRes = await q.limit(fetchLimit)

  if (txRes.error) {
    return { data: [], nextCursor: null, error: txRes.error }
  }

  let rows = ((txRes.data || []) as Omit<OfficeLedgerTransaction, "user" | "business">[]).filter((row) =>
    matchesOfficeLedgerFilters(row, opts),
  )

  if (cursor) {
    const cursorOccurred = cursor.occurred_at || cursor.created_at
    const cursorCreated = cursor.created_at
    rows = rows.filter((row) => {
      const rowOccurred = row.occurred_at || row.created_at
      if (rowOccurred !== cursorOccurred) {
        return rowOccurred < cursorOccurred
      }
      if (row.created_at !== cursorCreated) {
        return row.created_at < cursorCreated
      }
      return String(row.id) < cursor.id
    })
  }

  rows = [...rows]
    .sort((a, b) => {
      const da = new Date(a.occurred_at || a.created_at || 0).getTime()
      const db = new Date(b.occurred_at || b.created_at || 0).getTime()
      if (db !== da) return db - da
      const ca = new Date(a.created_at || 0).getTime()
      const cb = new Date(b.created_at || 0).getTime()
      if (cb !== ca) return cb - ca
      return String(b.id).localeCompare(String(a.id))
    })

  const pageRows = rows.slice(0, limit)
  const nextCursor =
    rows.length > limit && pageRows.length > 0
      ? encodeOfficeLedgerCursor(pageRows[pageRows.length - 1])
      : null
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

  return { data: attachAccountProfiles(pageRows, profiles, businesses), nextCursor, error: null }
}
