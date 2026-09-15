import type { SupabaseClient } from "@supabase/supabase-js"

export type CrossBorderLeg2DraftPayload = {
  quoteKey: string
  payInCurrency: string
  receiveCurrency: string
  receiveCountry: string
  customerRate: number
  receiveAmount: number
  requestedReceiveAmount: number
  lockedReceiveAmount?: number
  recipientSurplusLocal?: number
  payoutQuantumLocal?: number
  settlementQuantumUsd?: number
  precisionMode?: "micro" | "cent"
  sendLegFeeLocal?: number
  discardedSendIds?: string[]
  sendExpiresAt?: string
  payInRail: "bank_transfer" | "mobile_money"
  receiveChannelId: string
  sendChannelId: string
  sendChannelType?: "bank" | "momo"
  sendRail: "bank_transfer" | "mobile_money"
  ycBuyTo: number
  ycSellFrom: number
  easnerSellFrom: number
  reportingSourceToUsdRate: number
  pricingBeforeReceive: Record<string, unknown>
  sendLeg: {
    cryptoAmountUsd: number
    networkFeeAmountUsd: number
    serviceFeeAmountUsd: number
  }
  sendRes: {
    id?: string | null
    status?: string | null
    rate?: number | null
    settlementInfo?: Record<string, unknown> | null
    networkFeeAmountUSD?: number | null
    serviceFeeAmountUSD?: number | null
  }
  recipientMapped: Record<string, unknown>
  sender: Record<string, unknown>
  sourcePhone?: string
  sourceNetworkId?: string
  sourceNetworkName?: string
}

export async function findReusableCrossBorderLeg2Draft(
  admin: SupabaseClient,
  input: { userId: string; quoteKey: string },
): Promise<Record<string, unknown> | null> {
  const now = Date.now()
  const { data: rows } = await admin
    .from("yc_transfers")
    .select("*")
    .eq("user_id", input.userId)
    .eq("mode", "cross_border_send")
    .eq("status", "leg2_quoted")
    .contains("metadata", { quote_key: input.quoteKey })
    .order("created_at", { ascending: false })
    .limit(5)

  for (const row of rows ?? []) {
    const expiresAt = row.expires_at != null ? new Date(String(row.expires_at)).getTime() : null
    if (expiresAt != null && expiresAt <= now) continue
    return row as Record<string, unknown>
  }
  return null
}

export async function persistCrossBorderLeg2Draft(input: {
  admin: SupabaseClient
  userId: string
  businessId?: string | null
  quoteKey: string
  payInCurrency: string
  receiveCurrency: string
  receiveAmount: number
  requestedReceiveAmount: number
  customerRate: number
  leg2SequenceId: string
  leg2YcId: string | null
  leg2ChannelId: string
  sendLeg: CrossBorderLeg2DraftPayload["sendLeg"]
  settlementInfo: Record<string, unknown> | null
  expiresAt: string
  payload: CrossBorderLeg2DraftPayload
}): Promise<string> {
  const { data, error } = await input.admin
    .from("yc_transfers")
    .insert({
      transaction_id: null,
      user_id: input.userId,
      business_id: input.businessId ?? null,
      mode: "cross_border_send",
      status: "leg2_quoted",
      pay_in_currency: input.payInCurrency,
      receive_currency: input.receiveCurrency,
      quoted_pay_in: Number(input.payload.pricingBeforeReceive.localPayIn ?? 0),
      quoted_receive: input.receiveAmount,
      customer_rate: input.customerRate,
      leg2_sequence_id: input.leg2SequenceId,
      leg2_yc_id: input.leg2YcId,
      leg2_channel_id: input.leg2ChannelId,
      leg2_status: input.payload.sendRes.status ?? "quoted",
      settlement_info: input.settlementInfo,
      metadata: {
        quote_key: input.quoteKey,
        requested_receive_amount: input.requestedReceiveAmount,
        leg2_draft: input.payload,
        provisional_pay_in: input.payload.pricingBeforeReceive.provisionalPayIn,
        processing_fee: input.payload.pricingBeforeReceive.processingFee,
        yc_leg_fees_usd: input.payload.pricingBeforeReceive.ycLegFeesUsd,
        yc_sell_from: input.payload.ycSellFrom,
        yc_buy_to: input.payload.ycBuyTo,
      },
      expires_at: input.expiresAt,
    })
    .select("id")
    .single()

  if (error || !data?.id) {
    throw new Error(error?.message || "failed_to_create_leg2_draft")
  }
  return String(data.id)
}

export async function loadCrossBorderLeg2Draft(
  admin: SupabaseClient,
  input: { userId: string; leg2DraftId: string },
): Promise<{ row: Record<string, unknown>; payload: CrossBorderLeg2DraftPayload }> {
  const { data: row, error } = await admin
    .from("yc_transfers")
    .select("*")
    .eq("id", input.leg2DraftId)
    .eq("user_id", input.userId)
    .eq("mode", "cross_border_send")
    .eq("status", "leg2_quoted")
    .maybeSingle()

  if (error || !row) {
    throw new Error("leg2_session_not_found")
  }
  const expiresAt = row.expires_at != null ? new Date(String(row.expires_at)).getTime() : null
  if (expiresAt != null && expiresAt <= Date.now()) {
    throw new Error("leg2_session_expired")
  }
  const meta = (row.metadata || {}) as Record<string, unknown>
  const payload = meta.leg2_draft as CrossBorderLeg2DraftPayload | undefined
  if (!payload?.quoteKey) {
    throw new Error("leg2_session_invalid")
  }
  return { row: row as Record<string, unknown>, payload }
}
