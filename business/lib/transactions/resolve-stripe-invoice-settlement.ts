import {
  buildStripeInvoiceSettlementLifecycle,
  isStripeInvoiceSettlementMetadata,
  type StripeInvoiceSettlementLifecycleStep,
} from "@easner/shared"
import { resolveLedgerWhenAtFromRow } from "@/lib/ledger/ledger-occurred-at"

export type ResolvedStripeInvoiceSettlement = {
  lifecycle: StripeInvoiceSettlementLifecycleStep[]
  settlementPhase: string
  invoiceId: string | null
  invoiceNumber: string | null
  /** List subtitle / detail — e.g. Invoice #EINV-… */
  invoiceReference: string | null
  feeAmount: number
  grossAmount: number
  netAmount: number
  paymentMethodLabel: string | null
  /** Friendly rail: Bank account | Stablecoin */
  settlementRailLabel: string | null
}

function centsToMajor(cents: unknown): number {
  const n = typeof cents === "number" ? cents : Number(cents)
  if (!Number.isFinite(n)) return 0
  return n / 100
}

function paymentMethodLabel(raw: unknown): string | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
  if (!s) return null
  if (s === "card") return "Card"
  if (s === "us_bank_account" || s === "ach_debit" || s === "ach") return "Bank"
  if (s === "sepa_debit") return "SEPA"
  if (s === "link") return "Link"
  // Title-case unknown Stripe PM types: "apple_pay" → "Apple pay"
  return s
    .split("_")
    .filter(Boolean)
    .map((part, i) => (i === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ")
}

function settlementRailLabel(raw: unknown): string | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
  if (s === "grid_va") return "Bank account"
  if (s === "turnkey_stablecoin") return "Stablecoin"
  return null
}

export function resolveStripeInvoiceSettlementDetail(
  row: Record<string, unknown>,
): ResolvedStripeInvoiceSettlement | null {
  const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
  if (!isStripeInvoiceSettlementMetadata(meta)) return null

  const createdAt = resolveLedgerWhenAtFromRow(row)
  const settledAt = row.settled_at != null ? String(row.settled_at) : null
  const lifecycle = buildStripeInvoiceSettlementLifecycle({
    status: String(row.status ?? ""),
    metadata: meta,
    createdAt,
    settledAt,
  })

  const invoiceNumber =
    typeof meta.invoice_number === "string" && meta.invoice_number.trim()
      ? meta.invoice_number.trim()
      : null

  return {
    lifecycle,
    settlementPhase: String(meta.settlement_phase ?? "payment_received"),
    invoiceId: typeof meta.invoice_id === "string" && meta.invoice_id.trim() ? meta.invoice_id.trim() : null,
    invoiceNumber,
    invoiceReference: invoiceNumber ? `Invoice #${invoiceNumber}` : null,
    feeAmount: centsToMajor(meta.fee_cents),
    grossAmount: centsToMajor(meta.gross_cents),
    netAmount: centsToMajor(meta.net_cents),
    paymentMethodLabel: paymentMethodLabel(meta.payment_method_type),
    settlementRailLabel: settlementRailLabel(meta.settlement_rail),
  }
}
