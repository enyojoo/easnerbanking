import type { SupabaseClient } from "@supabase/supabase-js"
import type { WalletSendInboundCredit, WalletSendInboundSource } from "@easner/shared"
import { roundUsd } from "@easner/shared"

export type RecordInboundEventInput = {
  businessId: string
  amountUsd: number
  source: WalletSendInboundSource
  transactionId?: string | null
  creditKey?: string | null
  creditedAt?: string
  metadata?: Record<string, unknown>
}

export async function recordInboundEvent(
  admin: SupabaseClient,
  input: RecordInboundEventInput,
): Promise<{ recorded: boolean; id?: string }> {
  const businessId = String(input.businessId || "").trim()
  const amountUsd = roundUsd(input.amountUsd)
  if (!businessId || !(amountUsd > 0)) return { recorded: false }

  const { data, error } = await admin
    .from("wallet_send_inbound_events")
    .insert({
      business_id: businessId,
      amount_usd: amountUsd,
      source: input.source,
      transaction_id: input.transactionId ?? null,
      credit_key: input.creditKey ?? null,
      credited_at: input.creditedAt ?? new Date().toISOString(),
      metadata: input.metadata ?? {},
    })
    .select("id")
    .maybeSingle()

  if (error) {
    if (error.code === "23505") return { recorded: false }
    console.error("[wallet-send-compliance] record inbound failed:", error.message)
    return { recorded: false }
  }
  return { recorded: true, id: data?.id ? String(data.id) : undefined }
}

export async function listInboundCredits(
  admin: SupabaseClient,
  businessId: string,
  sinceIso: string,
): Promise<WalletSendInboundCredit[]> {
  const { data, error } = await admin
    .from("wallet_send_inbound_events")
    .select("amount_usd,credited_at")
    .eq("business_id", businessId)
    .gte("credited_at", sinceIso)
    .order("credited_at", { ascending: true })
    .limit(500)
  if (error) {
    console.error("[wallet-send-compliance] list inbound failed:", error.message)
    return []
  }
  return (data ?? []).map((row) => ({
    amountUsd: Number(row.amount_usd ?? 0),
    creditedAt: String(row.credited_at),
  }))
}

export async function recentInboundTotalUsd(
  admin: SupabaseClient,
  businessId: string,
  sinceIso: string,
  minAmountUsd = 0,
): Promise<number> {
  const credits = await listInboundCredits(admin, businessId, sinceIso)
  return roundUsd(
    credits.filter((c) => c.amountUsd >= minAmountUsd).reduce((sum, c) => sum + c.amountUsd, 0),
  )
}
