import type { SupabaseClient } from "@supabase/supabase-js"

const RECONCILE_WARN_TOLERANCE_USDC = 0.01

export function pickNoahBreakdownAmount(tx: Record<string, unknown>, type: string): number | null {
  const items = tx.Breakdown
  if (!Array.isArray(items)) return null
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    if (String(row.Type ?? "") !== type) continue
    const n = Number.parseFloat(String(row.Amount ?? ""))
    if (Number.isFinite(n)) return Math.abs(n)
  }
  return null
}

export type ReconcileGlobalPayoutMarginInput = {
  txData: Record<string, unknown>
  priorMetadata: Record<string, unknown>
  transactionId: string
}

export type ReconcileGlobalPayoutMarginResult = {
  patch: Record<string, unknown>
  expectedMargin: number | null
  noahBusinessFee: number | null
  delta: number | null
}

/** Compare Noah settlement BusinessFee to quoted margin_amount on global payout OUT settle. */
export function buildGlobalPayoutMarginReconciliationPatch(
  input: ReconcileGlobalPayoutMarginInput,
): ReconcileGlobalPayoutMarginResult {
  const noahBusinessFee = pickNoahBreakdownAmount(input.txData, "BusinessFee")
  const expectedRaw = input.priorMetadata.margin_amount
  const expectedMargin =
    expectedRaw != null && Number.isFinite(Number(expectedRaw)) ? Number(expectedRaw) : null

  if (noahBusinessFee == null || expectedMargin == null) {
    return { patch: {}, expectedMargin, noahBusinessFee, delta: null }
  }

  const delta = Math.round((noahBusinessFee - expectedMargin) * 1_000_000) / 1_000_000
  const captureMode = String(input.priorMetadata.margin_capture_mode || "surplus_send")

  if (Math.abs(delta) > RECONCILE_WARN_TOLERANCE_USDC) {
    console.warn("[global_payout_margin_reconcile]", {
      transactionId: input.transactionId,
      easnerPayoutId: input.priorMetadata.easner_payout_id,
      expectedMargin,
      noahBusinessFee,
      delta,
      marginCaptureMode: captureMode,
    })
  }

  return {
    patch: {
      margin_reconciled: true,
      noah_business_fee: noahBusinessFee,
      margin_reconciliation_delta: delta,
    },
    expectedMargin,
    noahBusinessFee,
    delta,
  }
}

export type ReconcileGlobalPayoutChannelFeeResult = {
  patch: Record<string, unknown>
  quotedChannelCost: number | null
  noahChannelFee: number | null
  scheduleFee: number | null
  deltaQuoted: number | null
  deltaSchedule: number | null
}

/** Compare Noah settlement ChannelFee to quoted exchange_fee / channel_cost. */
export function buildGlobalPayoutChannelFeeReconciliationPatch(
  input: ReconcileGlobalPayoutMarginInput,
): ReconcileGlobalPayoutChannelFeeResult {
  const noahChannelFee = pickNoahBreakdownAmount(input.txData, "ChannelFee")
  const quotedRaw =
    input.priorMetadata.channel_cost ??
    input.priorMetadata.exchange_fee ??
    (input.priorMetadata.payout_review as Record<string, unknown> | undefined)?.exchange_fee
  const quotedChannelCost =
    quotedRaw != null && Number.isFinite(Number(quotedRaw)) ? Number(quotedRaw) : null
  const scheduleRaw =
    input.priorMetadata.noah_schedule_fee ??
    (input.priorMetadata.payout_review as Record<string, unknown> | undefined)?.noah_schedule_fee
  const scheduleFee =
    scheduleRaw != null && Number.isFinite(Number(scheduleRaw)) ? Number(scheduleRaw) : null

  if (noahChannelFee == null) {
    return {
      patch: {},
      quotedChannelCost,
      noahChannelFee: null,
      scheduleFee,
      deltaQuoted: null,
      deltaSchedule: null,
    }
  }

  const deltaQuoted =
    quotedChannelCost != null
      ? Math.round((noahChannelFee - quotedChannelCost) * 1_000_000) / 1_000_000
      : null
  const deltaSchedule =
    scheduleFee != null
      ? Math.round((noahChannelFee - scheduleFee) * 1_000_000) / 1_000_000
      : null

  if (deltaQuoted != null && Math.abs(deltaQuoted) > RECONCILE_WARN_TOLERANCE_USDC) {
    console.warn("[global_payout_channel_fee_reconcile]", {
      transactionId: input.transactionId,
      easnerPayoutId: input.priorMetadata.easner_payout_id,
      quotedChannelCost,
      noahChannelFee,
      deltaQuoted,
      scheduleFee,
      deltaSchedule,
    })
  }

  const patch: Record<string, unknown> = {
    channel_fee_reconciled: true,
    noah_settlement_channel_fee: noahChannelFee,
    channel_fee_reconciliation_delta: deltaQuoted,
  }

  // Intentionally do NOT rewrite payout_review.exchange_fee/channel_cost here. That field is
  // now the display channel component that foots `Total = Sending + Processing fee`; replacing
  // it with the raw Noah ChannelFee would break the displayed footing. The settlement value is
  // still recorded above as noah_settlement_channel_fee for ops/reconciliation.

  return {
    patch,
    quotedChannelCost,
    noahChannelFee,
    scheduleFee,
    deltaQuoted,
    deltaSchedule,
  }
}

export async function applyGlobalPayoutChannelFeeReconciliation(
  admin: SupabaseClient,
  input: ReconcileGlobalPayoutMarginInput,
): Promise<void> {
  const { patch } = buildGlobalPayoutChannelFeeReconciliationPatch(input)
  if (!Object.keys(patch).length) return

  const { data: row } = await admin
    .from("transactions")
    .select("metadata")
    .eq("id", input.transactionId)
    .maybeSingle()
  if (!row?.metadata || typeof row.metadata !== "object") return

  const merged = { ...(row.metadata as Record<string, unknown>), ...patch }
  await admin.from("transactions").update({ metadata: merged }).eq("id", input.transactionId)
}

export async function applyGlobalPayoutMarginReconciliation(
  admin: SupabaseClient,
  input: ReconcileGlobalPayoutMarginInput,
): Promise<void> {
  const { patch } = buildGlobalPayoutMarginReconciliationPatch(input)
  if (!Object.keys(patch).length) return

  const { data: row } = await admin
    .from("transactions")
    .select("metadata")
    .eq("id", input.transactionId)
    .maybeSingle()
  if (!row?.metadata || typeof row.metadata !== "object") return

  const merged = { ...(row.metadata as Record<string, unknown>), ...patch }
  await admin.from("transactions").update({ metadata: merged }).eq("id", input.transactionId)
}
