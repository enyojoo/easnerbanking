/**
 * Three-step Stripe invoice settlement lifecycle:
 * Payment received → Clearing → Available
 */

export type StripeInvoiceSettlementLifecycleStepId =
  | "payment_received"
  | "clearing"
  | "available"
  | "failed"

export type StripeInvoiceSettlementLifecycleStepState = "complete" | "current" | "upcoming"

export type StripeInvoiceSettlementLifecycleStep = {
  id: StripeInvoiceSettlementLifecycleStepId
  title: string
  description: string
  state: StripeInvoiceSettlementLifecycleStepState
  occurredAt: string | null
}

export type StripeSettlementRail = "grid_va" | "turnkey_stablecoin"

function readIso(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key]
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

function normalizeLedgerStatus(status: string): string {
  const s = String(status || "").trim().toLowerCase()
  if (s === "settled") return "settled"
  if (s === "failed" || s === "cancelled") return "failed"
  if (s === "pending" || s === "processing") return "processing"
  return s || "processing"
}

function normalizePhase(meta: Record<string, unknown>): string {
  const phase = String(meta.settlement_phase ?? "").trim().toLowerCase()
  if (
    phase === "payment_received" ||
    phase === "payout_sent" ||
    phase === "credited" ||
    phase === "failed"
  ) {
    return phase
  }
  return ""
}

function clearingDescription(rail: StripeSettlementRail | null): string {
  if (rail === "turnkey_stablecoin") {
    return "Payout is on the way to your stablecoin deposit address."
  }
  if (rail === "grid_va") {
    return "Payout is on the way to your bank account."
  }
  return "Payout is clearing to your Easner account."
}

export type BuildStripeInvoiceSettlementLifecycleInput = {
  status: string
  metadata?: Record<string, unknown> | null
  createdAt?: string | null
  settledAt?: string | null
}

export function isStripeInvoiceSettlementMetadata(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  if (!meta) return false
  return String(meta.source ?? "").toLowerCase() === "invoice_stripe"
}

/** Payment Link or website-embed collection on the same settlement rail as invoices. */
export function isStripeCheckoutSettlementMetadata(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  if (!meta) return false
  return String(meta.source ?? "").toLowerCase() === "checkout_stripe"
}

export function isStripeCollectionSettlementMetadata(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  return isStripeInvoiceSettlementMetadata(meta) || isStripeCheckoutSettlementMetadata(meta)
}

/** List/detail title for a collection settlement — invoice number, link label, or embed. */
export function stripeCollectionSettlementTitle(
  meta: Record<string, unknown> | null | undefined,
): string {
  if (isStripeInvoiceSettlementMetadata(meta)) return "Invoice payment"
  const headline = typeof meta?.headline === "string" ? meta.headline.trim() : ""
  return headline || "Online payment"
}

export function buildStripeInvoiceSettlementLifecycle(
  input: BuildStripeInvoiceSettlementLifecycleInput,
): StripeInvoiceSettlementLifecycleStep[] {
  const meta = input.metadata ?? {}
  const ledgerStatus = normalizeLedgerStatus(input.status)
  const phase = normalizePhase(meta)
  const railRaw = String(meta.settlement_rail ?? "").trim().toLowerCase()
  const rail: StripeSettlementRail | null =
    railRaw === "grid_va" || railRaw === "turnkey_stablecoin"
      ? (railRaw as StripeSettlementRail)
      : null

  const paymentReceivedAt =
    readIso(meta, "payment_received_at") ?? input.createdAt ?? null
  const clearingAt =
    readIso(meta, "payout_sent_at") ?? readIso(meta, "clearing_at") ?? null
  const availableAt =
    readIso(meta, "credited_at") ??
    readIso(meta, "completed_at") ??
    input.settledAt ??
    null
  const failedAt = readIso(meta, "failed_at") ?? null

  if (ledgerStatus === "failed" || phase === "failed") {
    return [
      {
        id: "payment_received",
        title: "Payment received",
        description: "Customer payment was collected successfully.",
        state: "complete",
        occurredAt: paymentReceivedAt,
      },
      {
        id: "failed",
        title: "Failed",
        description:
          "This settlement could not be completed. Contact support with your invoice number.",
        state: "current",
        occurredAt: failedAt,
      },
    ]
  }

  const isCredited = ledgerStatus === "settled" || phase === "credited"
  const isClearing = !isCredited && (phase === "payout_sent" || clearingAt != null)

  const paymentState: StripeInvoiceSettlementLifecycleStepState = "complete"
  const clearingState: StripeInvoiceSettlementLifecycleStepState = isCredited
    ? "complete"
    : isClearing
      ? "current"
      : "upcoming"
  const availableState: StripeInvoiceSettlementLifecycleStepState = isCredited
    ? "complete"
    : "upcoming"

  return [
    {
      id: "payment_received",
      title: "Payment received",
      description: "Customer payment was collected successfully.",
      state: paymentState,
      occurredAt: paymentReceivedAt,
    },
    {
      id: "clearing",
      title: "Clearing",
      description: clearingDescription(rail),
      state: clearingState,
      occurredAt: clearingAt,
    },
    {
      id: "available",
      title: "Available",
      description: "Funds are now available in your account balance.",
      state: availableState,
      occurredAt: availableAt,
    },
  ]
}
