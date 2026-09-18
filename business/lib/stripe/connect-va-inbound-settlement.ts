import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { dispatchMerchantWebhook } from "@/lib/checkout/merchant-webhooks"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import {
  greedyPackSettlements,
  listPendingSettlementsForBusiness,
  SETTLEMENT_TABLES,
  type SettlementSource,
} from "@/lib/stripe/match-payout-to-settlements"
import type { StripeSettlementRail } from "@/lib/stripe/types"

export const CONNECT_VA_AMOUNT_TOLERANCE_CENTS = 2

export type PackedConnectSettlement = {
  source: SettlementSource
  row: Record<string, unknown>
}

export async function packPendingConnectSettlements(
  admin: SupabaseClient,
  businessId: string,
  amountCents: number,
): Promise<PackedConnectSettlement[]> {
  return greedyPackSettlements(
    await listPendingSettlementsForBusiness(admin, businessId),
    amountCents,
    CONNECT_VA_AMOUNT_TOLERANCE_CENTS,
  )
}

/**
 * Hop 3: credit pending invoice/checkout settlements from a Connect ACH into
 * the Office-routed VA (Grid or Bridge). Credits the wallet once.
 */
export async function creditConnectVaInboundSettlements(
  admin: SupabaseClient,
  input: {
    packed: PackedConnectSettlement[]
    businessId: string
    amountCents: number
    inboundId: string
    rail: Extract<StripeSettlementRail, "grid_va" | "bridge_va">
    skipWalletCredit: boolean
    existingTransferId: string | null
    customerId: string
    userId?: string | null
  },
): Promise<void> {
  const now = new Date().toISOString()
  const currency = String(input.packed[0]?.row.currency ?? "USD").toUpperCase()
  const netMajor = input.amountCents / 100
  const userId =
    input.userId ||
    (await resolveBusinessOrgOwnerUserId(admin, input.businessId)) ||
    String(input.packed[0]?.row.user_id ?? "")

  if (!input.skipWalletCredit) {
    await applyWalletBalanceDelta(admin, {
      businessId: input.businessId,
      userId: null,
      currency,
      delta: netMajor,
    })
  }

  const inboundMeta =
    input.rail === "bridge_va"
      ? { bridge_deposit_id: input.inboundId }
      : { grid_transaction_id: input.inboundId }

  for (const item of input.packed) {
    const table = SETTLEMENT_TABLES[item.source]
    const settlement = item.row
    if (String(settlement.phase) === "credited") continue

    await admin
      .from(table)
      .update({
        phase: "credited",
        credited_at: now,
        updated_at: now,
      })
      .eq("id", String(settlement.id))

    if (settlement.ledger_transaction_id) {
      const { data: tx } = await admin
        .from("transactions")
        .select("id,user_id,business_id,metadata,amount,currency,provider_transaction_id")
        .eq("id", String(settlement.ledger_transaction_id))
        .maybeSingle()
      if (tx?.id) {
        const prior =
          tx.metadata && typeof tx.metadata === "object"
            ? (tx.metadata as Record<string, unknown>)
            : {}
        await upsertLedgerTransaction(admin, {
          userId: String(tx.user_id),
          businessId: tx.business_id ? String(tx.business_id) : input.businessId,
          provider: "stripe",
          providerTransactionId: String(tx.provider_transaction_id),
          status: "settled",
          amount: Number(tx.amount ?? Number(settlement.net_cents ?? 0) / 100),
          currency: String(tx.currency ?? settlement.currency ?? currency),
          direction: "in",
          settledAt: now,
          metadata: {
            ...prior,
            settlement_phase: "credited",
            settlement_rail: input.rail,
            credited_at: now,
            stripe_connect_va_originator: "EASNER",
            ...inboundMeta,
          },
        })
      }
    }

    if (item.source === "checkout_stripe") {
      await dispatchMerchantWebhook(admin, {
        businessId: String(settlement.business_id ?? input.businessId),
        event: "payment.available",
        data: {
          amount_cents: Number(settlement.net_cents ?? 0),
          currency: String(settlement.currency ?? currency).toUpperCase(),
          ...(settlement.payment_link_id
            ? { payment_link_id: String(settlement.payment_link_id) }
            : {}),
          available_at: now,
        },
      })
      continue
    }

    const invoiceId = settlement.invoice_id ? String(settlement.invoice_id) : null
    if (!invoiceId) continue
    const { data: inv } = await admin
      .from("invoices")
      .select("metadata")
      .eq("id", invoiceId)
      .maybeSingle()
    if (inv?.metadata && typeof inv.metadata === "object") {
      const meta = { ...(inv.metadata as Record<string, unknown>) }
      const paymentInfo = (meta.paymentInfo ?? {}) as Record<string, unknown>
      const stripeInfo = (paymentInfo.stripe ?? {}) as Record<string, unknown>
      meta.paymentInfo = {
        ...paymentInfo,
        stripe: {
          ...stripeInfo,
          settlementPhase: "credited",
        },
      }
      await admin.from("invoices").update({ metadata: meta }).eq("id", invoiceId)
    }
  }

  const invoiceSettlementIds = input.packed
    .filter((s) => s.source === "invoice_stripe")
    .map((s) => String(s.row.id))
  const checkoutSettlementIds = input.packed
    .filter((s) => s.source === "checkout_stripe")
    .map((s) => String(s.row.id))

  if (input.existingTransferId) {
    await admin
      .from("grid_transfers")
      .update({
        status: "settled",
        grid_transaction_id: input.inboundId,
        updated_at: now,
      })
      .eq("id", input.existingTransferId)
    return
  }

  if (!userId) return
  await admin.from("grid_transfers").insert({
    user_id: userId,
    business_id: input.businessId,
    mode: "stripe_settlement",
    status: "settled",
    settlement_rail: input.rail,
    expected_amount_cents: input.amountCents,
    invoice_settlement_ids: invoiceSettlementIds,
    checkout_settlement_ids: checkoutSettlementIds,
    grid_customer_id: input.rail === "grid_va" ? input.customerId : null,
    grid_transaction_id: input.inboundId,
    receive_currency: currency,
    quoted_receive: netMajor,
    metadata: {
      source: input.rail === "bridge_va" ? "bridge_connect_inbound" : "grid_connect_inbound",
      originator: "EASNER",
      ...(input.rail === "bridge_va" ? { bridge_customer_id: input.customerId } : {}),
    },
  })
}
