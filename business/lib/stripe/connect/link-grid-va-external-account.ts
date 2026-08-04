import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { getVirtualAccountDisplayFromDb } from "@/lib/noah/virtual-accounts-db"
import { getStripe } from "../client"
import { configureConnectedAccountPayoutSchedule } from "./configure-payout-schedule"
import { syncConnectAccountRow } from "./sync-account-from-stripe"
import { getConnectAccountRow } from "./resolve-connect-account"

export type LinkPayoutDestinationResult =
  | {
      ok: true
      stripeExternalAccountId: string
      currency: string
      maskedDestination: string
      payoutInterval: string
    }
  | { ok: false; error: string; status: number }

function maskLast4(value: string | undefined | null): string {
  const s = String(value ?? "").replace(/\s+/g, "")
  if (s.length < 4) return "····"
  return `····${s.slice(-4)}`
}

/**
 * Register the business Grid VA as the Stripe connected-account external payout bank.
 * Idempotent when already linked.
 */
export async function linkGridVaExternalAccount(
  admin: SupabaseClient,
  input: { businessId: string; currency?: string },
): Promise<LinkPayoutDestinationResult> {
  const currency = (input.currency || "USD").trim().toUpperCase()
  const fiat = currency === "EUR" ? "eur" : currency === "GBP" ? "gbp" : "usd"

  const row = await getConnectAccountRow(admin, input.businessId)
  if (!row?.stripe_account_id) {
    return {
      ok: false,
      error: "Complete Stripe Connect onboarding first",
      status: 400,
    }
  }

  if (row.stripe_external_account_id?.trim()) {
    const ownerUserId = await resolveBusinessOrgOwnerUserId(admin, input.businessId)
    const va = ownerUserId
      ? await getVirtualAccountDisplayFromDb(admin, {
          currency: fiat,
          userId: ownerUserId,
          businessId: input.businessId,
        })
      : null
    return {
      ok: true,
      stripeExternalAccountId: row.stripe_external_account_id,
      currency,
      maskedDestination: maskLast4(va?.iban || va?.accountNumber),
      payoutInterval:
        typeof row.stripe_payout_schedule === "object" &&
        row.stripe_payout_schedule &&
        "interval" in row.stripe_payout_schedule
          ? String((row.stripe_payout_schedule as { interval?: string }).interval || "daily")
          : "daily",
    }
  }

  const ownerUserId = await resolveBusinessOrgOwnerUserId(admin, input.businessId)
  if (!ownerUserId) {
    return { ok: false, error: "No organization owner found", status: 400 }
  }

  const va = await getVirtualAccountDisplayFromDb(admin, {
    currency: fiat,
    userId: ownerUserId,
    businessId: input.businessId,
  })
  if (!va?.hasAccount) {
    return {
      ok: false,
      error: `No active ${currency} virtual account found`,
      status: 400,
    }
  }

  const stripe = getStripe()
  const country =
    fiat === "eur" ? "DE" : fiat === "gbp" ? "GB" : "US"

  let externalAccount: { id: string }
  try {
    if (fiat === "usd") {
      if (!va.accountNumber || !va.routingNumber) {
        return {
          ok: false,
          error: "USD virtual account is missing account or routing number",
          status: 400,
        }
      }
      externalAccount = await stripe.accounts.createExternalAccount(row.stripe_account_id, {
        external_account: {
          object: "bank_account",
          country: "US",
          currency: "usd",
          account_holder_type: "company",
          account_holder_name: va.accountHolderName || undefined,
          routing_number: va.routingNumber,
          account_number: va.accountNumber,
        },
        default_for_currency: true,
      })
    } else if (fiat === "eur") {
      if (!va.iban) {
        return { ok: false, error: "EUR virtual account is missing IBAN", status: 400 }
      }
      externalAccount = await stripe.accounts.createExternalAccount(row.stripe_account_id, {
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
      return {
        ok: false,
        error: `Currency ${currency} is not supported for Connect payout linking in v1`,
        status: 400,
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to link bank account to Stripe"
    return { ok: false, error: msg, status: 502 }
  }

  let payoutInterval = "daily"
  try {
    const schedule = await configureConnectedAccountPayoutSchedule(row.stripe_account_id)
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
    stripeAccountId: row.stripe_account_id,
  })

  return {
    ok: true,
    stripeExternalAccountId: externalAccount.id,
    currency,
    maskedDestination: maskLast4(va.iban || va.accountNumber),
    payoutInterval,
  }
}
