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
 * Ops note: Dashboard payout destination must match the business Grid VA or Turnkey address;
 * matcher uses destination_ref + amount tolerance (±1 cent) on Hop 3.
 */
export async function matchPayoutToSettlements(
  admin: SupabaseClient,
  payout: Stripe.Payout,
): Promise<{
  settlements: MatchedSettlement[]
  byBusiness: Map<string, MatchedSettlement[]>
}> {
  const stripe = getStripe()
  const settlements: MatchedSettlement[] = []
  const byBusiness = new Map<string, MatchedSettlement[]>()

  let startingAfter: string | undefined
  for (;;) {
    const page = await stripe.balanceTransactions.list({
      payout: payout.id,
      limit: 100,
      starting_after: startingAfter,
      expand: ["data.source"],
    })

    for (const bt of page.data) {
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
          const charge = await stripe.charges.retrieve(bt.source)
          paymentIntentId =
            typeof charge.payment_intent === "string"
              ? charge.payment_intent
              : charge.payment_intent?.id ?? ""
        } catch {
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

  // Crypto payouts (if present) → turnkey
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
