import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { getVirtualAccountDisplayFromDb } from "@/lib/noah/virtual-accounts-db"
import { getStripe } from "../client"
import { createGridVaExternalAccountOnStripe } from "./create-grid-va-external-account"
import { getConnectAccountRow } from "./resolve-connect-account"

export type ReconcileGridVaSkipReason =
  | "no_connect_account"
  | "details_not_submitted"
  | "no_grid_va"
  | "missing_va_details"

export type ReconcileGridVaResult =
  | { skipped: true; reason: ReconcileGridVaSkipReason }
  | { skipped: false; ok: true; action: "verified" | "updated_default" | "linked"; stripeExternalAccountId: string }
  | { skipped: false; ok: false; error: string }

type FiatCurrency = "usd" | "eur" | "gbp"

type VaSnapshot = {
  accountNumber?: string | null
  routingNumber?: string | null
  iban?: string | null
}

function normalizeDigits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, "")
}

function last4(value: string | null | undefined): string {
  const digits = normalizeDigits(value)
  return digits.length >= 4 ? digits.slice(-4) : digits
}

function gridVaMatchesBankAccount(
  va: VaSnapshot,
  fiat: FiatCurrency,
  bank: Stripe.BankAccount,
): boolean {
  const bankLast4 = String(bank.last4 ?? "").trim()
  if (!bankLast4) return false

  if (fiat === "usd") {
    const acctLast4 = last4(va.accountNumber)
    const routeLast4 = last4(va.routingNumber)
    const bankRouteLast4 = last4(bank.routing_number)
    return acctLast4 === bankLast4 && (!routeLast4 || !bankRouteLast4 || routeLast4 === bankRouteLast4)
  }

  if (fiat === "eur") {
    return last4(va.iban) === bankLast4
  }

  return false
}

async function persistExternalAccountId(
  admin: SupabaseClient,
  businessId: string,
  externalAccountId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await admin
    .from("business_stripe_connect_accounts")
    .update({
      stripe_external_account_id: externalAccountId,
      default_settlement_rail: "grid_va",
      updated_at: now,
    })
    .eq("business_id", businessId)
}

/**
 * Ensure the connected account's default payout bank is the business Grid VA.
 * Re-asserts when Stripe Dashboard edits drift the destination away from Easner.
 */
export async function reconcileGridVaPayoutDestination(
  admin: SupabaseClient,
  input: { businessId: string; currency?: string },
): Promise<ReconcileGridVaResult> {
  const currency = (input.currency || "USD").trim().toUpperCase()
  const fiat: FiatCurrency = currency === "EUR" ? "eur" : currency === "GBP" ? "gbp" : "usd"

  const row = await getConnectAccountRow(admin, input.businessId)
  if (!row?.stripe_account_id) {
    return { skipped: true, reason: "no_connect_account" }
  }
  if (!row.details_submitted) {
    return { skipped: true, reason: "details_not_submitted" }
  }

  const ownerUserId = await resolveBusinessOrgOwnerUserId(admin, input.businessId)
  if (!ownerUserId) {
    return { skipped: true, reason: "no_grid_va" }
  }

  const va = await getVirtualAccountDisplayFromDb(admin, {
    currency: fiat,
    userId: ownerUserId,
    businessId: input.businessId,
  })
  if (!va?.hasAccount) {
    return { skipped: true, reason: "no_grid_va" }
  }

  if (fiat === "usd" && (!va.accountNumber || !va.routingNumber)) {
    return { skipped: true, reason: "missing_va_details" }
  }
  if (fiat === "eur" && !va.iban) {
    return { skipped: true, reason: "missing_va_details" }
  }
  if (fiat === "gbp") {
    return { skipped: true, reason: "missing_va_details" }
  }

  const stripe = getStripe()
  const listed = await stripe.accounts.listExternalAccounts(row.stripe_account_id, {
    object: "bank_account",
    limit: 100,
  })
  const banks = listed.data.filter(
    (entry): entry is Stripe.BankAccount => entry.object === "bank_account",
  )
  const currencyBanks = banks.filter((bank) => String(bank.currency ?? "").toLowerCase() === fiat)
  const matching = currencyBanks.filter((bank) => gridVaMatchesBankAccount(va, fiat, bank))
  const defaultBank = currencyBanks.find((bank) => bank.default_for_currency) ?? null

  if (matching.length > 0) {
    const target = matching[0]
    if (!target.default_for_currency) {
      await stripe.accounts.updateExternalAccount(row.stripe_account_id, target.id, {
        default_for_currency: true,
      })
      await persistExternalAccountId(admin, input.businessId, target.id)
      return {
        skipped: false,
        ok: true,
        action: "updated_default",
        stripeExternalAccountId: target.id,
      }
    }

    await persistExternalAccountId(admin, input.businessId, target.id)
    return {
      skipped: false,
      ok: true,
      action: row.stripe_external_account_id === target.id ? "verified" : "updated_default",
      stripeExternalAccountId: target.id,
    }
  }

  if (defaultBank && !gridVaMatchesBankAccount(va, fiat, defaultBank)) {
    console.warn(
      "[stripe-connect] payout destination drift detected; re-linking Grid VA",
      input.businessId,
      defaultBank.id,
    )
  }

  const linked = await createGridVaExternalAccountOnStripe(admin, {
    businessId: input.businessId,
    stripeAccountId: row.stripe_account_id,
    currency,
    va,
  })
  if (!linked.ok) {
    return { skipped: false, ok: false, error: linked.error }
  }

  return {
    skipped: false,
    ok: true,
    action: "linked",
    stripeExternalAccountId: linked.stripeExternalAccountId,
  }
}
