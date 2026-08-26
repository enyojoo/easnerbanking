import type { SupabaseClient } from "@supabase/supabase-js"
import {
  mapRowToInvoice,
  invoiceToDbPayload,
  type B2bInvoiceRow,
} from "@/lib/b2b/map-invoice"
import type { Invoice } from "@/lib/b2b/types"
import { writeInvoiceAuditLog } from "@/lib/invoices/invoice-audit-log"
import { notifyInvoiceStripeRefunded } from "@/lib/invoices/notify-invoice-refunded"
import { applyCheckoutStripeRefund } from "./apply-checkout-stripe-refund"

type RestorableStatus = Extract<Invoice["status"], "sent" | "past_due" | "unpaid">

const RESTORE_STATUSES = new Set<RestorableStatus>(["sent", "past_due", "unpaid"])

export type ApplyInvoiceStripeRefundInput = {
  settlementId?: string
  chargeId?: string
  refundId: string
  refundedAt?: string
  source: "api" | "webhook"
  actorUserId?: string | null
  /** Stripe event id for settlement event_ids append (webhook). */
  stripeEventId?: string | null
}

export type ApplyInvoiceStripeRefundResult =
  | {
      ok: true
      applied: boolean
      skipped?: "already_applied" | "credited" | "not_found"
      invoiceId?: string
      businessId?: string
      restoredStatus?: RestorableStatus
      ledgerTransactionId?: string | null
    }
  | { ok: false; error: string }

/**
 * Restore last issued status before the most recent `paid` entry.
 * Falls back to unpaid when history has no prior issued status.
 */
export function restoreInvoiceStatusAfterStripeRefund(
  statusHistory: Invoice["statusHistory"] | undefined,
): RestorableStatus {
  const history = statusHistory ?? []
  for (let i = history.length - 1; i >= 0; i--) {
    const status = String(history[i]?.status ?? "")
      .trim()
      .toLowerCase()
    if (status === "paid") continue
    if (RESTORE_STATUSES.has(status as RestorableStatus)) {
      return status as RestorableStatus
    }
  }
  return "unpaid"
}

async function findSettlement(
  admin: SupabaseClient,
  input: ApplyInvoiceStripeRefundInput,
): Promise<{
  id: string
  invoice_id: string
  business_id: string
  phase: string
  ledger_transaction_id: string | null
  stripe_event_ids: string[]
} | null> {
  if (!input.settlementId && !input.chargeId) return null

  let query = admin
    .from("invoice_stripe_settlements")
    .select(
      "id,invoice_id,business_id,phase,ledger_transaction_id,stripe_event_ids",
    )

  if (input.settlementId) {
    query = query.eq("id", input.settlementId)
  } else {
    query = query.eq("stripe_charge_id", input.chargeId!)
  }

  const { data, error } = await query.limit(1).maybeSingle()
  if (error || !data) return null
  return {
    id: String(data.id),
    invoice_id: String(data.invoice_id),
    business_id: String(data.business_id),
    phase: String(data.phase),
    ledger_transaction_id: data.ledger_transaction_id
      ? String(data.ledger_transaction_id)
      : null,
    stripe_event_ids: Array.isArray(data.stripe_event_ids)
      ? data.stripe_event_ids.map(String)
      : [],
  }
}

/**
 * Idempotent side effects after a full Stripe invoice payment refund
 * (API or charge.refunded webhook): settlement failed, ledger failed,
 * invoice restored to payable issued status.
 */
export async function applyInvoiceStripeRefundSideEffects(
  admin: SupabaseClient,
  input: ApplyInvoiceStripeRefundInput,
): Promise<ApplyInvoiceStripeRefundResult> {
  const refundId = input.refundId?.trim()
  if (!refundId) {
    return { ok: false, error: "refundId required" }
  }
  if (!input.settlementId && !input.chargeId) {
    return { ok: false, error: "settlementId or chargeId required" }
  }

  const settlement = await findSettlement(admin, input)
  if (!settlement) {
    return { ok: true, applied: false, skipped: "not_found" }
  }

  if (settlement.phase === "credited") {
    if (input.stripeEventId) {
      await admin
        .from("invoice_stripe_settlements")
        .update({
          stripe_event_ids: [...settlement.stripe_event_ids, input.stripeEventId],
          updated_at: new Date().toISOString(),
        })
        .eq("id", settlement.id)
    }
    return {
      ok: true,
      applied: false,
      skipped: "credited",
      invoiceId: settlement.invoice_id,
      businessId: settlement.business_id,
      ledgerTransactionId: settlement.ledger_transaction_id,
    }
  }

  const { data: invoiceRow, error: invErr } = await admin
    .from("invoices")
    .select("*")
    .eq("id", settlement.invoice_id)
    .eq("business_id", settlement.business_id)
    .maybeSingle()

  if (invErr || !invoiceRow) {
    return { ok: false, error: invErr?.message || "Invoice not found" }
  }

  const existing = mapRowToInvoice(invoiceRow as B2bInvoiceRow)
  const priorRefundId = existing.paymentInfo?.method === "stripe"
    ? existing.paymentInfo.stripe?.refundId?.trim()
    : undefined

  if (
    priorRefundId === refundId ||
    (settlement.phase === "failed" && priorRefundId)
  ) {
    if (
      input.stripeEventId &&
      !settlement.stripe_event_ids.includes(input.stripeEventId)
    ) {
      await admin
        .from("invoice_stripe_settlements")
        .update({
          stripe_event_ids: [...settlement.stripe_event_ids, input.stripeEventId],
          updated_at: new Date().toISOString(),
        })
        .eq("id", settlement.id)
    }
    return {
      ok: true,
      applied: false,
      skipped: "already_applied",
      invoiceId: settlement.invoice_id,
      businessId: settlement.business_id,
      restoredStatus:
        existing.status !== "paid" ? existing.status : restoreInvoiceStatusAfterStripeRefund(existing.statusHistory),
      ledgerTransactionId: settlement.ledger_transaction_id,
    }
  }

  const refundedAt = input.refundedAt?.trim() || new Date().toISOString()
  const restoredStatus = restoreInvoiceStatusAfterStripeRefund(existing.statusHistory)

  const eventIds = input.stripeEventId
    ? [...settlement.stripe_event_ids, input.stripeEventId]
    : settlement.stripe_event_ids

  await admin
    .from("invoice_stripe_settlements")
    .update({
      phase: "failed",
      stripe_event_ids: eventIds,
      updated_at: refundedAt,
    })
    .eq("id", settlement.id)

  if (settlement.ledger_transaction_id) {
    const { data: ledgerRow } = await admin
      .from("transactions")
      .select("id,metadata")
      .eq("id", settlement.ledger_transaction_id)
      .maybeSingle()
    if (ledgerRow?.id) {
      const priorMeta =
        ledgerRow.metadata && typeof ledgerRow.metadata === "object"
          ? (ledgerRow.metadata as Record<string, unknown>)
          : {}
      await admin
        .from("transactions")
        .update({
          status: "failed",
          metadata: {
            ...priorMeta,
            settlement_phase: "failed",
            stripe_refund_id: refundId,
            failed_at: refundedAt,
          },
        })
        .eq("id", ledgerRow.id)
    }
  }

  const priorPayment = existing.paymentInfo
  const priorStripe =
    priorPayment?.method === "stripe" ? priorPayment.stripe : undefined

  const nextPaymentInfo: Invoice["paymentInfo"] =
    priorPayment?.method === "stripe" && priorStripe
      ? {
          ...priorPayment,
          stripe: {
            ...priorStripe,
            settlementPhase: "failed",
            refundId,
            refundedAt,
          },
        }
      : priorPayment

  const statusHistory = [
    ...(existing.statusHistory ?? []),
    { status: restoredStatus, timestamp: refundedAt },
  ]

  const updatedInvoice: Invoice = {
    ...existing,
    status: restoredStatus,
    paymentInfo: nextPaymentInfo,
    statusHistory,
  }

  const payload = invoiceToDbPayload({
    businessId: settlement.business_id,
    customerId: (invoiceRow as B2bInvoiceRow).customer_id,
    invoice: updatedInvoice,
    invoiceNumber: (invoiceRow as B2bInvoiceRow).invoice_number,
  })

  const { error: updateErr } = await admin
    .from("invoices")
    .update(payload)
    .eq("id", settlement.invoice_id)
    .eq("business_id", settlement.business_id)

  if (updateErr) {
    return { ok: false, error: updateErr.message }
  }

  void writeInvoiceAuditLog({
    invoiceId: settlement.invoice_id,
    businessId: settlement.business_id,
    actorUserId: input.actorUserId ?? null,
    action: "payment_refunded",
    changes: {
      before: { status: existing.status },
      after: { status: restoredStatus },
      refundId,
      source: input.source,
    },
  })

  void notifyInvoiceStripeRefunded(admin, {
    businessId: settlement.business_id,
    invoice: updatedInvoice,
  }).catch((e) => console.error("[stripe] refund notify:", e))

  await applyCheckoutStripeRefund(admin, {
    settlementId: settlement.id,
    refundId,
    refundedAt: input.refundedAt,
    stripeEventId: input.stripeEventId,
  })

  return {
    ok: true,
    applied: true,
    invoiceId: settlement.invoice_id,
    businessId: settlement.business_id,
    restoredStatus,
    ledgerTransactionId: settlement.ledger_transaction_id,
  }
}
