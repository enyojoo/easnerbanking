/**
 * Org fee-wallet inbound titles: Pay in fee, Payout fee, Payout refund.
 * Titles are derived at read time from metadata — no extra ledger rows.
 */

export const ORG_TREASURY_INBOUND_KINDS = [
  "pay_in_fee",
  "payout_fee",
  "payout_refund",
] as const

export type OrgTreasuryInboundKind = (typeof ORG_TREASURY_INBOUND_KINDS)[number]

export const ORG_TREASURY_INBOUND_TITLES: Record<OrgTreasuryInboundKind, string> = {
  pay_in_fee: "Pay in fee",
  payout_fee: "Payout fee",
  payout_refund: "Payout refund",
}

export function isOrgTreasuryInboundKind(value: unknown): value is OrgTreasuryInboundKind {
  return ORG_TREASURY_INBOUND_KINDS.includes(String(value) as OrgTreasuryInboundKind)
}

export function orgTreasuryInboundTitle(kind: OrgTreasuryInboundKind): string {
  return ORG_TREASURY_INBOUND_TITLES[kind]
}

export function isOrgTreasuryInboundTitle(name: string | null | undefined): boolean {
  const n = String(name ?? "").trim()
  return (
    n === ORG_TREASURY_INBOUND_TITLES.pay_in_fee ||
    n === ORG_TREASURY_INBOUND_TITLES.payout_fee ||
    n === ORG_TREASURY_INBOUND_TITLES.payout_refund
  )
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === "true" || value === 1
}

function readPayloadSource(
  meta?: Record<string, unknown> | null,
  payload?: Record<string, unknown> | null,
): string {
  const fromPayload =
    payload && typeof payload === "object" ? String(payload.source ?? "").trim() : ""
  const nested =
    meta?.payload && typeof meta.payload === "object"
      ? String((meta.payload as Record<string, unknown>).source ?? "").trim()
      : ""
  return (fromPayload || nested).toLowerCase()
}

export function isFeeWalletRevenueSweepRecord(
  meta?: Record<string, unknown> | null,
  payload?: Record<string, unknown> | null,
): boolean {
  if (isTruthyFlag(meta?.fee_wallet_revenue_sweep)) return true
  return readPayloadSource(meta, payload) === "fee_wallet_revenue_sweep"
}

export function hasOrgTreasuryRefundFlags(meta?: Record<string, unknown> | null): boolean {
  if (!meta) return false
  return (
    isTruthyFlag(meta.payout_refund) ||
    isTruthyFlag(meta.yc_fee_wallet_refund) ||
    String(meta.org_treasury_kind ?? "").toLowerCase() === "payout_refund"
  )
}

export function readRelatedEasnerTransactionId(
  meta?: Record<string, unknown> | null,
): string | null {
  const v = String(meta?.related_easner_transaction_id ?? "").trim()
  return v || null
}

export function orgTreasuryKindFromRelatedDirection(
  direction: string | null | undefined,
): OrgTreasuryInboundKind {
  return String(direction ?? "").toLowerCase() === "in" ? "pay_in_fee" : "payout_fee"
}

/**
 * Read-time kind. Prefer an explicit stamp, then a revenue sweep (Payout fee
 * unless already stamped pay_in_fee), then refund flags.
 */
export function resolveOrgTreasuryInboundKind(
  meta?: Record<string, unknown> | null,
  payload?: Record<string, unknown> | null,
): OrgTreasuryInboundKind | null {
  const stamped = meta?.org_treasury_kind
  if (isOrgTreasuryInboundKind(stamped)) return stamped
  if (isFeeWalletRevenueSweepRecord(meta, payload)) return "payout_fee"
  if (hasOrgTreasuryRefundFlags(meta)) return "payout_refund"
  return null
}

export function resolveOrgTreasuryInboundTitle(
  meta?: Record<string, unknown> | null,
  payload?: Record<string, unknown> | null,
): string | null {
  const kind = resolveOrgTreasuryInboundKind(meta, payload)
  return kind ? orgTreasuryInboundTitle(kind) : null
}

export type OrgTreasuryBackfillInput = {
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
  relatedDirection?: "in" | "out" | null
  relatedEtid?: string | null
  matchedSweepRelatedEtid?: string | null
  matchedRefundRelatedEtid?: string | null
}

export type OrgTreasuryBackfillResult = {
  kind: OrgTreasuryInboundKind | null
  relatedEtid: string | null
  skippedReason?: string
}

/**
 * Historical classifier. Refund hash/flags win over a mis-stamped sweep flag
 * on Yellowcard fee-wallet returns. Sweep without related direction → Payout fee.
 */
export function classifyOrgTreasuryInboundBackfill(
  input: OrgTreasuryBackfillInput,
): OrgTreasuryBackfillResult {
  const meta = input.metadata ?? {}
  const existingRelated = readRelatedEasnerTransactionId(meta) || input.relatedEtid || null

  if (input.matchedRefundRelatedEtid) {
    return {
      kind: "payout_refund",
      relatedEtid: input.matchedRefundRelatedEtid || existingRelated,
    }
  }

  if (isOrgTreasuryInboundKind(meta.org_treasury_kind)) {
    return {
      kind: meta.org_treasury_kind,
      relatedEtid: input.matchedSweepRelatedEtid || existingRelated,
    }
  }

  if (hasOrgTreasuryRefundFlags(meta)) {
    return { kind: "payout_refund", relatedEtid: existingRelated }
  }

  const isSweep =
    isFeeWalletRevenueSweepRecord(meta, input.payload) || Boolean(input.matchedSweepRelatedEtid)
  if (isSweep) {
    return {
      kind: orgTreasuryKindFromRelatedDirection(
        input.relatedDirection ?? (input.matchedSweepRelatedEtid ? "out" : null),
      ),
      relatedEtid: input.matchedSweepRelatedEtid || existingRelated,
    }
  }

  return { kind: null, relatedEtid: null, skippedReason: "unlabeled_stablecoin_deposit" }
}

export function buildOrgTreasuryInboundWriteMetadata(input: {
  kind: OrgTreasuryInboundKind
  relatedEasnerTransactionId?: string | null
}): Record<string, unknown> {
  const related = String(input.relatedEasnerTransactionId ?? "").trim()
  const relatedField = related ? { related_easner_transaction_id: related } : {}
  if (input.kind === "payout_refund") {
    return {
      org_treasury_kind: "payout_refund",
      payout_refund: true,
      yc_fee_wallet_refund: true,
      ...relatedField,
    }
  }
  return {
    org_treasury_kind: input.kind,
    fee_wallet_revenue_sweep: true,
    ...relatedField,
  }
}

export function mergeOrgTreasuryInboundMetadataPatch(
  current: Record<string, unknown>,
  result: OrgTreasuryBackfillResult,
): Record<string, unknown> | null {
  if (!result.kind) return null
  const next = {
    ...current,
    ...buildOrgTreasuryInboundWriteMetadata({
      kind: result.kind,
      relatedEasnerTransactionId: result.relatedEtid,
    }),
  }
  const sameKind = current.org_treasury_kind === next.org_treasury_kind
  const sameRelated =
    String(current.related_easner_transaction_id ?? "") ===
    String(next.related_easner_transaction_id ?? "")
  const sameRefund =
    result.kind !== "payout_refund" ||
    (isTruthyFlag(current.payout_refund) && isTruthyFlag(current.yc_fee_wallet_refund))
  const sameSweep =
    result.kind === "payout_refund" || isTruthyFlag(current.fee_wallet_revenue_sweep)
  if (sameKind && sameRelated && sameRefund && sameSweep) return null
  return next
}
