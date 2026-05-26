import type { createSupabaseAdmin } from "@/lib/supabase/admin"
import type { TxRow } from "./office-overview-compute"
import { enrichBankDepositLedgerRows } from "@/lib/transactions/enrich-bank-deposit-ledger-rows"
import { filterUserVisibleOfficeLedgerRows } from "./office-user-visible-transactions"
import type { OfficeLedgerTransaction } from "./office-load-transactions"

type AdminClient = ReturnType<typeof createSupabaseAdmin>

type UserProfileRow = {
  id: string
  email?: string | null
  full_name?: string | null
}

type BusinessRow = {
  id: string
  name?: string | null
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
      "id, created_at, updated_at, occurred_at, status, currency, amount, direction, user_id, business_id, provider, metadata, payload, base_currency, base_amount, easner_transaction_id",
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
  const windowRows = ((txRes.data || []) as Omit<TxRow, "user">[]).filter((t) => {
    const at = t.occurred_at || t.created_at
    if (!at) return false
    const ms = new Date(at).getTime()
    return Number.isFinite(ms) && ms >= sinceMs && ms <= untilMs
  })
  const userIds = [...new Set(windowRows.map((t) => t.user_id).filter((id): id is string => Boolean(id)))]
  const businessIds = [...new Set(windowRows.map((t) => t.business_id).filter((id): id is string => Boolean(id)))]

  const userById = new Map<string, UserProfileRow>()
  const businessById = new Map<string, BusinessRow>()

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

  if (businessIds.length > 0) {
    const { data: businesses, error: bizErr } = await admin
      .from("businesses")
      .select("id, name")
      .in("id", businessIds)

    if (bizErr) {
      console.error("office overview businesses batch:", bizErr)
    }

    for (const raw of businesses || []) {
      const b = raw as BusinessRow
      if (b?.id) businessById.set(String(b.id), b)
    }
  }

  const withUsers: TxRow[] = windowRows.map((t) => {
    const uid = t.user_id ? String(t.user_id) : ""
    const p = uid ? userById.get(uid) : undefined
    const bid = t.business_id ? String(t.business_id) : ""
    const biz = bid ? businessById.get(bid) : undefined
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
      business: biz
        ? {
            id: String(biz.id),
            name: biz.name ?? null,
          }
        : null,
    }
  })

  const visible = await filterUserVisibleOfficeLedgerRows(admin, withUsers as OfficeLedgerTransaction[])
  const enrichedRows = (await enrichBankDepositLedgerRows(
    admin,
    visible as Record<string, unknown>[],
  )) as TxRow[]

  const data = [...enrichedRows]
    .sort((a, b) => {
      const da = new Date(a.occurred_at || a.created_at || 0).getTime()
      const db = new Date(b.occurred_at || b.created_at || 0).getTime()
      return db - da
    })
    .slice(0, limit)

  return { data, error: null }
}
