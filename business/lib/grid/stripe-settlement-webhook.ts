import type { SupabaseClient } from "@supabase/supabase-js"
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
  SETTLEMENT_TABLES,
} from "@/lib/stripe/match-payout-to-settlements"
import {
  CONNECT_VA_AMOUNT_TOLERANCE_CENTS,
  creditConnectVaInboundSettlements,
  packPendingConnectSettlements,
  type PackedConnectSettlement,
} from "@/lib/stripe/connect-va-inbound-settlement"

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

type PackedSettlement = PackedConnectSettlement

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
    (await packPendingConnectSettlements(admin, businessId, amountCents))
  if (!packed.length) return { handled: false }

  const alreadyCredited = await inboundAlreadyCreditedWallet(admin, gridTransactionId)
  await deleteDuplicateVaInbound(admin, gridTransactionId)

  await creditConnectVaInboundSettlements(admin, {
    packed,
    businessId,
    amountCents,
    inboundId: gridTransactionId,
    rail: "grid_va",
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
    return Math.abs(expected - amountCents) <= CONNECT_VA_AMOUNT_TOLERANCE_CENTS
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
