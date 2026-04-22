import type { SupabaseClient } from "@supabase/supabase-js"

export type BalanceScope = {
  /** Business scope uses `business_id` (matches `businesses.id`). */
  businessId?: string | null
  /** Personal scope uses `user_id`. */
  userId?: string | null
}

export type WalletBalanceRow = {
  id: string
  business_id: string | null
  user_id: string | null
  currency: string
  available_balance: number
  version: number
  updated_at: string
}

function normalizeCurrency(raw: string): "USD" | "EUR" | null {
  const c = String(raw || "").trim().toUpperCase()
  if (c === "USD" || c === "EUR") return c
  return null
}

function parseAmount(raw: unknown): number | null {
  const n = Number.parseFloat(String(raw))
  if (!Number.isFinite(n)) return null
  return n
}

export async function upsertWalletBalanceSnapshot(
  admin: SupabaseClient,
  input: BalanceScope & { currency: string; availableBalance: number },
): Promise<void> {
  const currency = normalizeCurrency(input.currency)
  if (!currency) return
  const available = Number.isFinite(input.availableBalance) ? input.availableBalance : 0
  const businessId = input.businessId ? String(input.businessId) : null
  const userId = input.userId ? String(input.userId) : null
  if (!businessId && !userId) return

  // Upsert + bump version so realtime consumers can ignore out-of-order writes.
  const payload = {
    business_id: businessId,
    user_id: userId,
    currency,
    available_balance: available,
    updated_at: new Date().toISOString(),
  }

  // Select existing row so we can bump version deterministically.
  let q = admin.from("wallet_balances").select("id,version").eq("currency", currency).limit(1)
  if (businessId) q = q.eq("business_id", businessId)
  if (!businessId && userId) q = q.eq("user_id", userId)

  const { data: existing } = await q.maybeSingle()
  const nextVersion = Number(existing?.version ?? 0) + 1

  const { error } = await admin
    .from("wallet_balances")
    .upsert(
      { ...payload, version: nextVersion },
      { onConflict: businessId ? "business_id,currency" : "user_id,currency" },
    )
  if (error) throw error
}

export async function applyWalletBalanceDelta(
  admin: SupabaseClient,
  input: BalanceScope & { currency: string; delta: number },
): Promise<void> {
  const currency = normalizeCurrency(input.currency)
  if (!currency) return
  const businessId = input.businessId ? String(input.businessId) : null
  const userId = input.userId ? String(input.userId) : null
  if (!businessId && !userId) return

  const delta = parseAmount(input.delta)
  if (delta == null || delta === 0) return

  let q = admin
    .from("wallet_balances")
    .select("available_balance,version")
    .eq("currency", currency)
    .limit(1)
  if (businessId) q = q.eq("business_id", businessId)
  if (!businessId && userId) q = q.eq("user_id", userId)

  const { data: existing } = await q.maybeSingle()
  const current = Number(existing?.available_balance ?? 0)
  const next = Math.max(0, current + delta)
  await upsertWalletBalanceSnapshot(admin, {
    businessId,
    userId,
    currency,
    availableBalance: next,
  })
}

