import type { SupabaseClient } from "@supabase/supabase-js"
import { getVirtualAccountDisplayFromDb } from "@/lib/noah/virtual-accounts-db"
import { getStripe } from "../client"
import { GRID_USD_SPONSOR_BANK } from "@/lib/grid/usd-sponsor-bank"
import { configureConnectedAccountPayoutSchedule } from "./configure-payout-schedule"
import { syncConnectAccountRow } from "./sync-account-from-stripe"

function maskLast4(value: string | undefined | null): string {
  const s = String(value ?? "").replace(/\s+/g, "")
  if (s.length < 4) return "····"
  return `····${s.slice(-4)}`
}

type VaForLink = NonNullable<Awaited<ReturnType<typeof getVirtualAccountDisplayFromDb>>>

/** Create or promote Grid VA as default external payout account on Stripe. */
export async function createGridVaExternalAccountOnStripe(
  admin: SupabaseClient,
  input: {
    businessId: string
    stripeAccountId: string
    currency: string
    va: VaForLink
  },
): Promise<
  | { ok: true; stripeExternalAccountId: string; maskedDestination: string; payoutInterval: string }
  | { ok: false; error: string }
> {
  const currency = input.currency.trim().toUpperCase()
  const fiat = currency === "EUR" ? "eur" : currency === "GBP" ? "gbp" : "usd"
  const va = input.va
  const stripe = getStripe()
  const country = fiat === "eur" ? "DE" : fiat === "gbp" ? "GB" : "US"

  let externalAccount: { id: string }
  try {
    if (fiat === "usd") {
      const routingNumber = va.routingNumber?.trim() || GRID_USD_SPONSOR_BANK.routingNumber
      if (!va.accountNumber) {
        return { ok: false, error: "USD virtual account is missing account number" }
      }
      externalAccount = await stripe.accounts.createExternalAccount(input.stripeAccountId, {
        external_account: {
          object: "bank_account",
          country: "US",
          currency: "usd",
          account_holder_type: "company",
          account_holder_name: va.accountHolderName || undefined,
          routing_number: routingNumber,
          account_number: va.accountNumber,
        },
        default_for_currency: true,
      })
    } else if (fiat === "eur") {
      if (!va.iban) {
        return { ok: false, error: "EUR virtual account is missing IBAN" }
      }
      externalAccount = await stripe.accounts.createExternalAccount(input.stripeAccountId, {
        external_account: {
          object: "bank_account",
          country,
          currency: "eur",
          account_holder_type: "company",
          account_holder_name: va.accountHolderName || undefined,
          account_number: va.iban,
        },
        default_for_currency: true,
      })
    } else {
      return { ok: false, error: `Currency ${currency} is not supported for Connect payout linking in v1` }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to link bank account to Stripe"
    return { ok: false, error: msg }
  }

  let payoutInterval = "daily"
  try {
    const schedule = await configureConnectedAccountPayoutSchedule(input.stripeAccountId)
    payoutInterval = schedule.interval
  } catch (e) {
    console.warn("[stripe-connect] payout schedule update failed:", e)
  }

  const now = new Date().toISOString()
  await admin
    .from("business_stripe_connect_accounts")
    .update({
      stripe_external_account_id: externalAccount.id,
      default_settlement_rail: "grid_va",
      updated_at: now,
    })
    .eq("business_id", input.businessId)

  await syncConnectAccountRow(admin, {
    businessId: input.businessId,
    stripeAccountId: input.stripeAccountId,
  })

  return {
    ok: true,
    stripeExternalAccountId: externalAccount.id,
    maskedDestination: maskLast4(va.iban || va.accountNumber),
    payoutInterval,
  }
}
