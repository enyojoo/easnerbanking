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
