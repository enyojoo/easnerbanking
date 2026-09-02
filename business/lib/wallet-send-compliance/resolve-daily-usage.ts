import type { SupabaseClient } from "@supabase/supabase-js"
import { roundUsd, type WalletSendComplianceRail } from "@easner/shared"

const SUCCESS_STATUSES = new Set(["settled", "completed", "submitted", "processing", "pending"])

function isExternalWalletSend(meta: Record<string, unknown>): boolean {
  if (String(meta.activity_type ?? "").toLowerCase() !== "wallet_send") return false
  if (String(meta.source ?? "").toLowerCase() === "easetag_p2p") return false
  return true
}

function isFiatPayoutDebit(meta: Record<string, unknown>): boolean {
  if (isExternalWalletSend(meta)) return false
  if (String(meta.source ?? "").toLowerCase() === "easetag_p2p") return false
  if (String(meta.activity_type ?? "").toLowerCase() === "balance_convert") return false
  if (meta.wallet_send_margin_leg === true || meta.wallet_send_settlement_leg === true) return false
  if (meta.payout_review && typeof meta.payout_review === "object") return true
  if (meta.kind === "fiat_payout") return true
  const flow = String(meta.flow ?? "").toLowerCase()
  return flow === "balance_payout" || flow === "global_payout"
}

function amountUsd(row: { amount?: unknown; currency?: unknown; metadata?: unknown }): number {
  const meta =
    row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {}
  const reporting = Number(meta.reporting_wallet_amount ?? meta.total_debited ?? 0)
  if (Number.isFinite(reporting) && reporting > 0) return reporting
  const amount = Number(row.amount ?? 0)
  const currency = String(row.currency ?? "USD").toUpperCase()
  if (currency === "EUR") return amount * Number(meta.usd_rate ?? 1.1)
  return amount
}

export async function sumRolling24hOutboundUsd(
  admin: SupabaseClient,
  businessId: string,
  rail: WalletSendComplianceRail,
  now = Date.now(),
): Promise<{ usedUsd: number; oldestCountedAt: string | null }> {
  const since = new Date(now - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await admin
    .from("transactions")
    .select("amount,currency,status,direction,created_at,metadata")
    .eq("business_id", businessId)
    .eq("direction", "out")
    .gte("created_at", since)
    .limit(500)
  if (error) {
    console.error("[wallet-send-compliance] daily usage query failed:", error.message)
    return { usedUsd: 0, oldestCountedAt: null }
  }

  let usedUsd = 0
  let oldestCountedAt: string | null = null
  for (const row of data ?? []) {
    const status = String(row.status ?? "").toLowerCase()
    if (!SUCCESS_STATUSES.has(status) || status === "failed" || status === "cancelled") continue
    const meta =
      row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {}
    const match =
      rail === "stablecoin" ? isExternalWalletSend(meta) : isFiatPayoutDebit(meta)
    if (!match) continue
    usedUsd += amountUsd(row)
    const created = String(row.created_at ?? "")
    if (!oldestCountedAt || created < oldestCountedAt) oldestCountedAt = created
  }
  return { usedUsd: roundUsd(usedUsd), oldestCountedAt }
}

export function dailyRetryAfterIso(oldestCountedAt: string | null, now = Date.now()): string | null {
  if (!oldestCountedAt) return null
  const ms = Date.parse(oldestCountedAt)
  if (!Number.isFinite(ms)) return null
  return new Date(ms + 24 * 60 * 60 * 1000).toISOString()
}
