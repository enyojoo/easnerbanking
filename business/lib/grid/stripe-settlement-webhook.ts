import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { dispatchMerchantWebhook } from "@/lib/checkout/merchant-webhooks"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import { buildGridVaBankDepositCreditKey } from "./grid-bank-deposit-credit"
import { isStripeConnectPayoutInbound } from "./stripe-connect-payout-inbound"
import type { GridWebhookEvent } from "./types"
import { extractGridInboundAmountCents } from "./webhook-amount"
import {
  gridWebhookCustomerId,
  gridWebhookQuoteId,
  gridWebhookTransactionId,
} from "./webhook-event-id"
import {
  greedyPackSettlements,
  listPendingSettlementsForBusiness,
  SETTLEMENT_TABLES,
  type SettlementSource,
} from "@/lib/stripe/match-payout-to-settlements"

const AMOUNT_TOLERANCE_CENTS = 2
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

function webhookData(event: GridWebhookEvent): Record<string, unknown> | undefined {
  return event.data && typeof event.data === "object"
    ? (event.data as Record<string, unknown>)
    : undefined
}

function eventType(event: GridWebhookEvent): string {
  return String(event.eventType ?? event.type ?? "").trim().toUpperCase()
}

function isTerminalIncomingSuccess(event: GridWebhookEvent, status: string): boolean {
  const type = eventType(event)
  const normalized = status.toUpperCase()
  return (
    type.includes("INCOMING_PAYMENT.COMPLETED") ||
    (type.includes("INCOMING") && normalized.includes("COMPLETED")) ||
    normalized === "SETTLED"
  )
}

type PackedSettlement = {
  source: SettlementSource
  row: Record<string, unknown>
}

/**
 * Hop 3: Grid INCOMING from Connect originator (EASNER) → credit pending
 * invoice/checkout settlements. Does not require payout.paid.
 */
export async function handleGridStripeSettlementWebhook(
  admin: SupabaseClient,
  input: { event: GridWebhookEvent },
): Promise<{ handled: boolean }> {
  const data = webhookData(input.event)
  if (!data) return { handled: false }
  if (gridWebhookQuoteId(data)) return { handled: false }
  if (!isStripeConnectPayoutInbound(data)) return { handled: false }

  const status = String(data.status ?? "").trim()
  if (!isTerminalIncomingSuccess(input.event, status)) return { handled: false }

  const amountCents = extractGridInboundAmountCents(data)
  if (amountCents == null || !(amountCents > 0)) return { handled: false }

  const customerId = gridWebhookCustomerId(data)
  if (!customerId) return { handled: false }

  const { data: biz } = await admin
    .from("businesses")
    .select("id")
    .eq("grid_customer_id", customerId)
    .maybeSingle()
  const businessId = biz?.id ? String(biz.id) : null
  if (!businessId) return { handled: false }

  const gridTransactionId = gridWebhookTransactionId(data)
  if (!gridTransactionId) return { handled: false }

  if (await stripeAlreadySettledFromGrid(admin, businessId, gridTransactionId)) {
    await deleteDuplicateVaInbound(admin, gridTransactionId)
    return { handled: true }
  }

  const fromExpectation = await matchPendingGridTransfer(
    admin,
    customerId,
    amountCents,
  )
  const packed =
    fromExpectation ??
    greedyPackSettlements(
      await listPendingSettlementsForBusiness(admin, businessId),
      amountCents,
      AMOUNT_TOLERANCE_CENTS,
    )
  if (!packed.length) return { handled: false }

  const alreadyCredited = await inboundAlreadyCreditedWallet(admin, gridTransactionId)
  await deleteDuplicateVaInbound(admin, gridTransactionId)

  await finalizeMatch(admin, {
    packed,
    businessId,
    amountCents,
    gridTransactionId,
    existingTransferId: fromExpectationTransferId(fromExpectation),
    skipWalletCredit: alreadyCredited,
    customerId,
  })

  return { handled: true }
}

function fromExpectationTransferId(
  packed: (PackedSettlement & { transferId?: string })[] | null,
): string | null {
  return packed?.[0]?.transferId ? String(packed[0].transferId) : null
}

async function matchPendingGridTransfer(
  admin: SupabaseClient,
  customerId: string,
  amountCents: number,
): Promise<(PackedSettlement & { transferId: string })[] | null> {
  const since = new Date(Date.now() - MAX_AGE_MS).toISOString()
  const { data: candidates } = await admin
    .from("grid_transfers")
    .select("*")
    .eq("mode", "stripe_settlement")
    .eq("settlement_rail", "grid_va")
    .eq("status", "pending")
    .eq("grid_customer_id", customerId)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(50)

  const match = (candidates ?? []).find((row) => {
    const expected = Number(row.expected_amount_cents ?? 0)
    return Math.abs(expected - amountCents) <= AMOUNT_TOLERANCE_CENTS
  })
  if (!match?.id) return null

  const transferId = String(match.id)
  const invoiceIds = Array.isArray(match.invoice_settlement_ids)
    ? (match.invoice_settlement_ids as string[])
    : []
  const checkoutIds = Array.isArray(match.checkout_settlement_ids)
    ? (match.checkout_settlement_ids as string[])
    : []

  const packed: (PackedSettlement & { transferId: string })[] = []
  for (const id of invoiceIds) {
    const { data: row } = await admin
      .from(SETTLEMENT_TABLES.invoice_stripe)
      .select("*")
      .eq("id", id)
      .maybeSingle()
    if (row?.id) packed.push({ source: "invoice_stripe", row, transferId })
  }
  for (const id of checkoutIds) {
    const { data: row } = await admin
      .from(SETTLEMENT_TABLES.checkout_stripe)
      .select("*")
      .eq("id", id)
      .maybeSingle()
    if (row?.id) packed.push({ source: "checkout_stripe", row, transferId })
  }
  return packed.length ? packed : null
}

async function inboundAlreadyCreditedWallet(
  admin: SupabaseClient,
  gridTransactionId: string,
): Promise<boolean> {
  const creditKey = buildGridVaBankDepositCreditKey(gridTransactionId)
  const { data: row } = await admin
    .from("transactions")
    .select("id,metadata")
    .eq("provider", "grid")
    .eq("provider_transaction_id", gridTransactionId)
    .maybeSingle()
  if (!row?.id) return false
  const meta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {}
  return meta.wallet_balance_credit_key === creditKey
}

async function stripeAlreadySettledFromGrid(
  admin: SupabaseClient,
  businessId: string,
  gridTransactionId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("transactions")
    .select("id")
    .eq("provider", "stripe")
    .eq("business_id", businessId)
    .filter("metadata->>grid_transaction_id", "eq", gridTransactionId)
    .limit(1)
    .maybeSingle()
  return Boolean(data?.id)
}

async function deleteDuplicateVaInbound(
  admin: SupabaseClient,
  gridTransactionId: string,
): Promise<void> {
  const { data: row } = await admin
    .from("transactions")
    .select("id")
    .eq("provider", "grid")
    .eq("provider_transaction_id", gridTransactionId)
    .maybeSingle()
  if (!row?.id) return
  await admin.from("transactions").delete().eq("id", row.id)
}

async function finalizeMatch(
  admin: SupabaseClient,
  input: {
    packed: PackedSettlement[]
    businessId: string
    amountCents: number
    gridTransactionId: string
    existingTransferId: string | null
    skipWalletCredit: boolean
    customerId: string
  },
): Promise<void> {
  const now = new Date().toISOString()
  const currency = String(input.packed[0]?.row.currency ?? "USD").toUpperCase()
  const netMajor = input.amountCents / 100
  const userId =
    (await resolveBusinessOrgOwnerUserId(admin, input.businessId)) ??
    String(input.packed[0]?.row.user_id ?? "")

  if (!input.skipWalletCredit) {
    await applyWalletBalanceDelta(admin, {
      businessId: input.businessId,
      userId: null,
      currency,
      delta: netMajor,
    })
  }

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
            settlement_rail: "grid_va",
            credited_at: now,
            grid_transaction_id: input.gridTransactionId,
            stripe_connect_va_originator: "EASNER",
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
        grid_transaction_id: input.gridTransactionId,
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
    settlement_rail: "grid_va",
    expected_amount_cents: input.amountCents,
    invoice_settlement_ids: invoiceSettlementIds,
    checkout_settlement_ids: checkoutSettlementIds,
    grid_customer_id: input.customerId,
    grid_transaction_id: input.gridTransactionId,
    receive_currency: currency,
    quoted_receive: netMajor,
    metadata: { source: "grid_connect_inbound", originator: "EASNER" },
  })
}
