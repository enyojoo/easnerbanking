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

  return {
    lifecycle,
    settlementPhase: String(meta.settlement_phase ?? "payment_received"),
    invoiceId: typeof meta.invoice_id === "string" ? meta.invoice_id : null,
    invoiceNumber: typeof meta.invoice_number === "string" ? meta.invoice_number : null,
  }
}
