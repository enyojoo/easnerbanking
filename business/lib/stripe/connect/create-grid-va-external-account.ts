import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { getVirtualAccountDisplayFromDb } from "@/lib/noah/virtual-accounts-db"
import { getStripe } from "../client"
import { GRID_USD_SPONSOR_BANK } from "@/lib/grid/usd-sponsor-bank"
import { configureConnectedAccountPayoutSchedule } from "./configure-payout-schedule"
import {
  gridVaMatchesBankAccount,
  isDuplicateBankAccountError,
  pickCanonicalGridVaBank,
  stripeVaLinkIdempotencyKey,
  vaPayoutFingerprint,
  type FiatPayoutCurrency,
} from "./grid-va-bank-match"
import { syncConnectAccountRow } from "./sync-account-from-stripe"

function maskLast4(value: string | undefined | null): string {
  const s = String(value ?? "").replace(/\D/g, "")
  if (s.length < 4) return "····"
  return `····${s.slice(-4)}`
}

type VaForLink = NonNullable<Awaited<ReturnType<typeof getVirtualAccountDisplayFromDb>>>

async function findExistingGridVaBank(
  stripe: Stripe,
  stripeAccountId: string,
  fiat: FiatPayoutCurrency,
  va: VaForLink,
): Promise<Stripe.BankAccount | null> {
  const listed = await stripe.accounts.listExternalAccounts(stripeAccountId, {
    object: "bank_account",
    limit: 100,
  })
  const matching = listed.data.filter((entry): entry is Stripe.BankAccount => {
    if (entry.object !== "bank_account") return false
    if (String(entry.currency ?? "").toLowerCase() !== fiat) return false
    return gridVaMatchesBankAccount(va, fiat, entry)
  })
  return pickCanonicalGridVaBank(matching)
}

/** Create or reuse Grid VA as default external payout account on Stripe. */
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
  const fiat: FiatPayoutCurrency = currency === "EUR" ? "eur" : currency === "GBP" ? "gbp" : "usd"
  const va = input.va
  const stripe = getStripe()
  const country = fiat === "eur" ? "DE" : fiat === "gbp" ? "GB" : "US"
  const routingNumber = va.routingNumber?.trim() || GRID_USD_SPONSOR_BANK.routingNumber
  const idempotencyKey = stripeVaLinkIdempotencyKey(
    input.businessId,
    currency,
    vaPayoutFingerprint(fiat, va, routingNumber),
  )

  let externalAccount: { id: string }
  try {
    if (fiat === "usd") {
      if (!va.accountNumber) {
        return { ok: false, error: "USD virtual account is missing account number" }
      }
      externalAccount = await stripe.accounts.createExternalAccount(
        input.stripeAccountId,
        {
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
        },
        { idempotencyKey },
      )
    } else if (fiat === "eur") {
      if (!va.iban) {
        return { ok: false, error: "EUR virtual account is missing IBAN" }
      }
      externalAccount = await stripe.accounts.createExternalAccount(
        input.stripeAccountId,
        {
          external_account: {
            object: "bank_account",
            country,
            currency: "eur",
            account_holder_type: "company",
            account_holder_name: va.accountHolderName || undefined,
            account_number: va.iban,
          },
          default_for_currency: true,
        },
        { idempotencyKey },
      )
    } else {
      return { ok: false, error: `Currency ${currency} is not supported for Connect payout linking in v1` }
    }
  } catch (e) {
    if (!isDuplicateBankAccountError(e)) {
      const msg = e instanceof Error ? e.message : "Failed to link bank account to Stripe"
      return { ok: false, error: msg }
    }
    const existing = await findExistingGridVaBank(stripe, input.stripeAccountId, fiat, va)
    if (!existing) {
      const msg = e instanceof Error ? e.message : "Failed to link bank account to Stripe"
      return { ok: false, error: msg }
    }
    externalAccount = existing
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
