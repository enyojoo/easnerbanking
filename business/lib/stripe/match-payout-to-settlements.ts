import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { getStripe } from "./client"
import type { StripeSettlementRail } from "./types"

export type MatchedSettlement = {
  settlementId: string
  invoiceId: string
  businessId: string
  netCents: number
  currency: string
  ledgerTransactionId: string | null
  balanceTransactionId: string | null
}

/**
 * Resolve invoice settlements included in a Stripe payout via balance transactions.
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
      if (bt.type !== "charge" && bt.type !== "payment" && bt.type !== "payment_refund") {
        // Destination-charge transfers often appear as "payment" on connected accounts
        // after platform transfer; also try type "transfer" source lookup below.
      }
      if (bt.type !== "charge" && bt.type !== "payment") continue

      let paymentIntentId = ""
      const source = bt.source
      if (source && typeof source === "object") {
        if ("payment_intent" in source) {
          const pi = (source as Stripe.Charge).payment_intent
          paymentIntentId = typeof pi === "string" ? pi : pi?.id ?? ""
        }
      }

      if (!paymentIntentId && typeof bt.source === "string") {
        try {
          const charge = await stripe.charges.retrieve(bt.source, undefined, requestOpts)
          paymentIntentId =
            typeof charge.payment_intent === "string"
              ? charge.payment_intent
              : charge.payment_intent?.id ?? ""
        } catch {
          // On connected accounts, source may be a Transfer — try platform charge via metadata later
          continue
        }
      }

      if (!paymentIntentId) continue

      const { data: settlement } = await admin
        .from("invoice_stripe_settlements")
        .select(
          "id,invoice_id,business_id,net_cents,currency,ledger_transaction_id,phase",
        )
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle()

      if (!settlement?.id) continue
      if (settlement.phase === "credited") continue

      const matched: MatchedSettlement = {
        settlementId: String(settlement.id),
        invoiceId: String(settlement.invoice_id),
        businessId: String(settlement.business_id),
        netCents: Number(settlement.net_cents ?? 0),
        currency: String(settlement.currency ?? "USD").toUpperCase(),
        ledgerTransactionId: settlement.ledger_transaction_id
          ? String(settlement.ledger_transaction_id)
          : null,
        balanceTransactionId: bt.id,
      }
      settlements.push(matched)
      const list = byBusiness.get(matched.businessId) ?? []
      list.push(matched)
      byBusiness.set(matched.businessId, list)
    }

    if (!page.has_more || page.data.length === 0) break
    startingAfter = page.data[page.data.length - 1]?.id
    if (!startingAfter) break
  }

  // Fallback for Connect destination charges: payout may not expose PI on connected balance txs.
  // Match pending settlements for the connected account by net amount proximity.
  if (settlements.length === 0 && opts?.stripeAccountId) {
    const { data: pending } = await admin
      .from("invoice_stripe_settlements")
      .select(
        "id,invoice_id,business_id,net_cents,currency,ledger_transaction_id,phase",
      )
      .eq("stripe_connected_account_id", opts.stripeAccountId)
      .eq("phase", "payment_received")
      .order("created_at", { ascending: true })
      .limit(50)

    const payoutAmount = typeof payout.amount === "number" ? payout.amount : 0
    if (pending?.length && payoutAmount > 0) {
      // Greedy pack settlements whose nets sum close to payout amount (±2 cents)
      let remaining = payoutAmount
      for (const settlement of pending) {
        const net = Number(settlement.net_cents ?? 0)
        if (net <= 0) continue
        if (net - remaining > 2) continue
        const matched: MatchedSettlement = {
          settlementId: String(settlement.id),
          invoiceId: String(settlement.invoice_id),
          businessId: String(settlement.business_id),
          netCents: net,
          currency: String(settlement.currency ?? "USD").toUpperCase(),
          ledgerTransactionId: settlement.ledger_transaction_id
            ? String(settlement.ledger_transaction_id)
            : null,
          balanceTransactionId: null,
        }
        settlements.push(matched)
        const list = byBusiness.get(matched.businessId) ?? []
        list.push(matched)
        byBusiness.set(matched.businessId, list)
        remaining -= net
        if (remaining <= 2) break
      }
    }
  }

  return { settlements, byBusiness }
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

  // Temp crypto payouts (if present) → turnkey
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

  // Default fiat → Grid VA
  const { data: va } = await admin
    .from("virtual_accounts")
    .select("id,noah_virtual_account_id,account_number,iban")
    .eq("business_id", businessId)
    .eq("provider", "grid")
    .eq("status", "active")
    .limit(1)
    .maybeSingle()

  const destinationRef =
    (va?.noah_virtual_account_id && String(va.noah_virtual_account_id)) ||
    (va?.iban && String(va.iban)) ||
    (va?.account_number && String(va.account_number)) ||
    (va?.id && String(va.id)) ||
    destId ||
    "grid_va"

  return { rail: "grid_va", destinationRef }
}
