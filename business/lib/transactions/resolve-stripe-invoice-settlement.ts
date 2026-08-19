import {
  buildStripeInvoiceSettlementLifecycle,
  isStripeCollectionSettlementMetadata,
  stripeCollectionSettlementTitle,
  type StripeInvoiceSettlementLifecycleStep,
} from "@easner/shared"
import { resolveLedgerWhenAtFromRow } from "@/lib/ledger/ledger-occurred-at"
import {
  paymentMethodDisplayFromMetadata,
  type StripePaymentMethodDisplay,
} from "@/lib/stripe/parse-payment-method-display"
import {
  formatPaymentMethodListLabel,
  formatPaymentMethodText,
} from "@/lib/stripe/payment-method-display"

export type ResolvedStripeInvoiceSettlement = {
  lifecycle: StripeInvoiceSettlementLifecycleStep[]
  settlementPhase: string
  /** Hero/list title — invoice number, payment link label, or "Online payment". */
  displayTitle: string
  invoiceId: string | null
  invoiceNumber: string | null
  feeAmount: number
  grossAmount: number
  netAmount: number
  paymentMethodLabel: string | null
  /** Full label with mask when available. */
  paymentMethodText: string | null
  paymentMethod: StripePaymentMethodDisplay | null
  customerName: string | null
  customerEmail: string | null
  /** Friendly rail: Bank account | Stablecoin */
  settlementRailLabel: string | null
}

function centsToMajor(cents: unknown): number {
  const n = typeof cents === "number" ? cents : Number(cents)
  if (!Number.isFinite(n)) return 0
  return n / 100
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
  if (!isStripeCollectionSettlementMetadata(meta)) return null

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

  const paymentMethod = paymentMethodDisplayFromMetadata(meta)
  const customerName =
    typeof meta.customer_name === "string" && meta.customer_name.trim()
      ? meta.customer_name.trim()
      : null
  const customerEmail =
    typeof meta.customer_email === "string" && meta.customer_email.trim()
      ? meta.customer_email.trim()
      : null

  return {
    lifecycle,
    settlementPhase: String(meta.settlement_phase ?? "payment_received"),
    displayTitle: stripeCollectionSettlementTitle(meta),
    invoiceId: typeof meta.invoice_id === "string" && meta.invoice_id.trim() ? meta.invoice_id.trim() : null,
    invoiceNumber,
    feeAmount: centsToMajor(meta.fee_cents),
    grossAmount: centsToMajor(meta.gross_cents),
    netAmount: centsToMajor(meta.net_cents),
    paymentMethodLabel: paymentMethod ? formatPaymentMethodListLabel(paymentMethod) : null,
    paymentMethodText: paymentMethod ? formatPaymentMethodText(paymentMethod) : null,
    paymentMethod,
    customerName,
    customerEmail,
    settlementRailLabel: settlementRailLabel(meta.settlement_rail),
  }
}
