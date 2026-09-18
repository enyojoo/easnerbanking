import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { getStripe } from "./client"
import { last4Digits } from "./connect/grid-va-bank-match"
import type { StripeSettlementRail } from "./types"

/** Which settlement table a matched row belongs to. */
export type SettlementSource = "invoice_stripe" | "checkout_stripe"

export const SETTLEMENT_TABLES: Record<SettlementSource, string> = {
  invoice_stripe: "invoice_stripe_settlements",
  checkout_stripe: "checkout_stripe_settlements",
}

export type MatchedSettlement = {
  source: SettlementSource
  settlementId: string
  /** Null for Payment Link and website-embed collections. */
  invoiceId: string | null
  businessId: string
  netCents: number
  currency: string
  ledgerTransactionId: string | null
  balanceTransactionId: string | null
}

const SETTLEMENT_COLUMNS = "id,business_id,net_cents,currency,ledger_transaction_id,phase"

function toMatched(
  source: SettlementSource,
  row: Record<string, unknown>,
  balanceTransactionId: string | null,
): MatchedSettlement {
  return {
    source,
    settlementId: String(row.id),
    invoiceId: row.invoice_id ? String(row.invoice_id) : null,
    businessId: String(row.business_id),
    netCents: Number(row.net_cents ?? 0),
    currency: String(row.currency ?? "USD").toUpperCase(),
    ledgerTransactionId: row.ledger_transaction_id ? String(row.ledger_transaction_id) : null,
    balanceTransactionId,
  }
}

async function findSettlementByPaymentIntent(
  admin: SupabaseClient,
  paymentIntentId: string,
): Promise<{ source: SettlementSource; row: Record<string, unknown> } | null> {
  const { data: invoiceRow } = await admin
    .from(SETTLEMENT_TABLES.invoice_stripe)
    .select(`${SETTLEMENT_COLUMNS},invoice_id`)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle()
  if (invoiceRow?.id) return { source: "invoice_stripe", row: invoiceRow }

  const { data: checkoutRow } = await admin
    .from(SETTLEMENT_TABLES.checkout_stripe)
    .select(SETTLEMENT_COLUMNS)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle()
  if (checkoutRow?.id) return { source: "checkout_stripe", row: checkoutRow }

  return null
}

/**
 * Resolve the collection settlements included in a Stripe payout via balance transactions.
 * For Connect, pass stripeAccountId (event.account) so balance txs are listed on the connected account.
 */
export async function matchPayoutToSettlements(
  admin: SupabaseClient,
  payout: Stripe.Payout,
  opts?: { stripeAccountId?: string | null },
): Promise<{
  settlements: MatchedSettlement[]
  byBusiness: Map<string, MatchedSettlement[]>
}> {
  const stripe = getStripe()
  const settlements: MatchedSettlement[] = []
  const byBusiness = new Map<string, MatchedSettlement[]>()
  const requestOpts: { stripeAccount?: string } | undefined = opts?.stripeAccountId
    ? { stripeAccount: opts.stripeAccountId }
    : undefined

  const collect = (matched: MatchedSettlement) => {
    settlements.push(matched)
    const list = byBusiness.get(matched.businessId) ?? []
    list.push(matched)
    byBusiness.set(matched.businessId, list)
  }

  let startingAfter: string | undefined
  for (;;) {
    const page = await stripe.balanceTransactions.list(
      {
        payout: payout.id,
        limit: 100,
        starting_after: startingAfter,
        expand: ["data.source"],
      },
      requestOpts,
    )

    for (const bt of page.data) {
      // Direct Charges appear as "payment" on connected accounts.
      if (bt.type !== "charge" && bt.type !== "payment") continue

      let paymentIntentId = ""
      const source = bt.source
      if (source && typeof source === "object" && "payment_intent" in source) {
        const pi = (source as Stripe.Charge).payment_intent
        paymentIntentId = typeof pi === "string" ? pi : pi?.id ?? ""
      }

      if (!paymentIntentId && typeof bt.source === "string") {
        try {
          const charge = await stripe.charges.retrieve(bt.source, undefined, requestOpts)
          paymentIntentId =
            typeof charge.payment_intent === "string"
              ? charge.payment_intent
              : charge.payment_intent?.id ?? ""
        } catch {
          // On connected accounts the source may be a Transfer – handled by the fallback below.
          continue
        }
      }

      if (!paymentIntentId) continue

      const found = await findSettlementByPaymentIntent(admin, paymentIntentId)
      if (!found) continue
      if (String(found.row.phase) === "credited") continue
      collect(toMatched(found.source, found.row, bt.id))
    }

    if (!page.has_more || page.data.length === 0) break
    startingAfter = page.data[page.data.length - 1]?.id
    if (!startingAfter) break
  }

  // Fallback for Direct Charges: payout may not expose the payment intent on
  // connected balance txs. Greedily pack pending settlements whose nets sum to the payout.
  if (settlements.length === 0 && opts?.stripeAccountId) {
    const payoutAmount = typeof payout.amount === "number" ? payout.amount : 0
    if (payoutAmount > 0) {
      const pending = await listPendingSettlementsForAccount(admin, opts.stripeAccountId)
      for (const candidate of greedyPackSettlements(pending, payoutAmount)) {
        collect(toMatched(candidate.source, candidate.row, null))
      }
    }
  }

  return { settlements, byBusiness }
}

async function listPendingSettlementsForAccount(
  admin: SupabaseClient,
  stripeAccountId: string,
): Promise<{ source: SettlementSource; row: Record<string, unknown> }[]> {
  const [{ data: invoiceRows }, { data: checkoutRows }] = await Promise.all([
    admin
      .from(SETTLEMENT_TABLES.invoice_stripe)
      .select(`${SETTLEMENT_COLUMNS},invoice_id,created_at`)
      .eq("stripe_connected_account_id", stripeAccountId)
      .eq("phase", "payment_received")
      .order("created_at", { ascending: true })
      .limit(50),
    admin
      .from(SETTLEMENT_TABLES.checkout_stripe)
      .select(`${SETTLEMENT_COLUMNS},created_at`)
      .eq("stripe_connected_account_id", stripeAccountId)
      .eq("phase", "payment_received")
      .order("created_at", { ascending: true })
      .limit(50),
  ])

  return [
    ...(invoiceRows ?? []).map((row) => ({ source: "invoice_stripe" as const, row })),
    ...(checkoutRows ?? []).map((row) => ({ source: "checkout_stripe" as const, row })),
  ].sort((a, b) => String(a.row.created_at ?? "").localeCompare(String(b.row.created_at ?? "")))
}

const OPEN_SETTLEMENT_PHASES = ["payment_received", "payout_sent"] as const

/** Open invoice + checkout settlements for a business, oldest first. */
export async function listPendingSettlementsForBusiness(
  admin: SupabaseClient,
  businessId: string,
): Promise<{ source: SettlementSource; row: Record<string, unknown> }[]> {
  const [{ data: invoiceRows }, { data: checkoutRows }] = await Promise.all([
    admin
      .from(SETTLEMENT_TABLES.invoice_stripe)
      .select(`${SETTLEMENT_COLUMNS},invoice_id,created_at`)
      .eq("business_id", businessId)
      .in("phase", [...OPEN_SETTLEMENT_PHASES])
      .order("created_at", { ascending: true })
      .limit(100),
    admin
      .from(SETTLEMENT_TABLES.checkout_stripe)
      .select(`${SETTLEMENT_COLUMNS},created_at`)
      .eq("business_id", businessId)
      .in("phase", [...OPEN_SETTLEMENT_PHASES])
      .order("created_at", { ascending: true })
      .limit(100),
  ])

  return [
    ...(invoiceRows ?? []).map((row) => ({ source: "invoice_stripe" as const, row })),
    ...(checkoutRows ?? []).map((row) => ({ source: "checkout_stripe" as const, row })),
  ].sort((a, b) => String(a.row.created_at ?? "").localeCompare(String(b.row.created_at ?? "")))
}

/** FIFO pack of open settlements whose nets sum to inbound cents (Connect VA hop). */
export function greedyPackSettlements(
  pending: { source: SettlementSource; row: Record<string, unknown> }[],
  amountCents: number,
  toleranceCents = 2,
): { source: SettlementSource; row: Record<string, unknown> }[] {
  if (!(amountCents > 0)) return []
  const packed: { source: SettlementSource; row: Record<string, unknown> }[] = []
  let remaining = amountCents
  for (const candidate of pending) {
    const net = Number(candidate.row.net_cents ?? 0)
    if (net <= 0) continue
    if (net - remaining > toleranceCents) continue
    packed.push(candidate)
    remaining -= net
    if (remaining <= toleranceCents) break
  }
  if (Math.abs(remaining) > toleranceCents) return []
  return packed
}

/**
 * Infer settlement rail from payout destination vs business VA / Turnkey address.
 */
export async function inferSettlementRail(
  admin: SupabaseClient,
  businessId: string,
  payout: Stripe.Payout,
): Promise<{ rail: StripeSettlementRail; destinationRef: string }> {
  const dest = payout.destination
  const destId = typeof dest === "string" ? dest : dest && typeof dest === "object" ? dest.id : null
  const destLast4 =
    dest && typeof dest === "object" && "last4" in dest
      ? last4Digits(String((dest as { last4?: string | null }).last4 ?? ""))
      : ""

  const method = String(payout.method || "").toLowerCase()
  const type = String(payout.type || "").toLowerCase()
  if (method.includes("crypto") || type.includes("crypto")) {
    const { data: deposits } = await admin
      .from("wallet_accounts")
      .select("address")
      .eq("business_id", businessId)
      .limit(5)
    const addr = deposits?.[0]?.address ? String(deposits[0].address) : destId || "turnkey"
    return { rail: "turnkey_stablecoin", destinationRef: addr }
  }

  const { data: connect } = await admin
    .from("business_stripe_connect_accounts")
    .select("default_settlement_rail")
    .eq("business_id", businessId)
    .maybeSingle()

  const { data: vas } = await admin
    .from("virtual_accounts")
    .select("id,provider,provider_virtual_account_id,account_number,iban")
    .eq("business_id", businessId)
    .in("provider", ["grid", "bridge"])
    .neq("status", "retired")
    .neq("status", "inactive")
    .limit(8)

  const destinationRefFor = (va: Record<string, unknown> | null | undefined, fallbackRail: string) =>
    (va?.provider_virtual_account_id && String(va.provider_virtual_account_id)) ||
    (va?.iban && String(va.iban)) ||
    (va?.account_number && String(va.account_number)) ||
    (va?.id && String(va.id)) ||
    destId ||
    fallbackRail

  const rows = (vas ?? []) as Record<string, unknown>[]
  if (destLast4) {
    const matched = rows.find((va) => {
      const vaLast4 = last4Digits(String(va.iban || va.account_number || ""))
      return Boolean(vaLast4) && vaLast4 === destLast4
    })
    if (matched) {
      const rail: StripeSettlementRail = String(matched.provider ?? "") === "bridge" ? "bridge_va" : "grid_va"
      return { rail, destinationRef: destinationRefFor(matched, rail) }
    }
  }

  const storedRail = String(connect?.default_settlement_rail ?? "").trim()
  if (storedRail === "bridge_va" || storedRail === "grid_va") {
    const provider = storedRail === "bridge_va" ? "bridge" : "grid"
    const matched = rows.find((va) => String(va.provider ?? "") === provider) ?? rows[0]
    return { rail: storedRail, destinationRef: destinationRefFor(matched, storedRail) }
  }

  const first = rows[0]
  const rail: StripeSettlementRail = String(first?.provider ?? "") === "bridge" ? "bridge_va" : "grid_va"
  return { rail, destinationRef: destinationRefFor(first, rail) }
}
