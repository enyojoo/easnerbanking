import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { getStripe } from "../client"
import { createGridVaExternalAccountOnStripe } from "./create-grid-va-external-account"
import { resolveConnectPayoutVa } from "./resolve-connect-payout-va"
import {
  gridVaMatchesBankAccount,
  pickCanonicalGridVaBank,
  type FiatPayoutCurrency,
} from "./grid-va-bank-match"
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

type VaSnapshot = {
  accountNumber?: string | null
  routingNumber?: string | null
  iban?: string | null
}

const inflightByKey = new Map<string, Promise<ReconcileGridVaResult>>()

export function __resetReconcileGridVaLockForTests(): void {
  inflightByKey.clear()
}

async function persistExternalAccountId(
  admin: SupabaseClient,
  businessId: string,
  externalAccountId: string,
  rail: "grid_va" | "bridge_va" = "grid_va",
): Promise<void> {
  const now = new Date().toISOString()
  await admin
    .from("business_stripe_connect_accounts")
    .update({
      stripe_external_account_id: externalAccountId,
      default_settlement_rail: rail,
      updated_at: now,
    })
    .eq("business_id", businessId)
}

async function ensureDefaultBank(
  stripe: Stripe,
  stripeAccountId: string,
  bank: Stripe.BankAccount,
): Promise<"verified" | "updated_default"> {
  if (bank.default_for_currency) return "verified"
  await stripe.accounts.updateExternalAccount(stripeAccountId, bank.id, {
    default_for_currency: true,
  })
  return "updated_default"
}

function isMissingExternalAccountError(error: unknown): boolean {
  const code =
    typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : ""
  return code === "resource_missing"
}

async function retrieveStoredBank(
  stripe: Stripe,
  stripeAccountId: string,
  storedId: string,
): Promise<Stripe.BankAccount | null> {
  try {
    const existing = await stripe.accounts.retrieveExternalAccount(stripeAccountId, storedId)
    if (existing.object !== "bank_account") return null
    return existing
  } catch (error) {
    if (isMissingExternalAccountError(error)) return null
    throw error
  }
}

/**
 * Ensure the connected account's default payout bank is the Office-routed VA
 * (Grid or Bridge). Concurrent callers for the same business share one in-flight run.
 */
export async function reconcileGridVaPayoutDestination(
  admin: SupabaseClient,
  input: { businessId: string; currency?: string },
): Promise<ReconcileGridVaResult> {
  const currency = (input.currency || "USD").trim().toUpperCase()
  const key = `${input.businessId}:${currency}`
  const existing = inflightByKey.get(key)
  if (existing) return existing

  const run = reconcileGridVaPayoutDestinationUnlocked(admin, input).finally(() => {
    if (inflightByKey.get(key) === run) inflightByKey.delete(key)
  })
  inflightByKey.set(key, run)
  return run
}

async function reconcileGridVaPayoutDestinationUnlocked(
  admin: SupabaseClient,
  input: { businessId: string; currency?: string },
): Promise<ReconcileGridVaResult> {
  const currency = (input.currency || "USD").trim().toUpperCase()
  const fiat: FiatPayoutCurrency = currency === "EUR" ? "eur" : currency === "GBP" ? "gbp" : "usd"

  const row = await getConnectAccountRow(admin, input.businessId)
  if (!row?.stripe_account_id) {
    return { skipped: true, reason: "no_connect_account" }
  }

  const payoutVa = await resolveConnectPayoutVa(admin, {
    businessId: input.businessId,
    currency,
  })
  const va = payoutVa?.va
  if (!va?.hasAccount) {
    return { skipped: true, reason: "no_grid_va" }
  }
  const rail = payoutVa.rail

  if (fiat === "usd" && !va.accountNumber) {
    return { skipped: true, reason: "missing_va_details" }
  }
  if (fiat === "eur" && !va.iban) {
    return { skipped: true, reason: "missing_va_details" }
  }
  if (fiat === "gbp") {
    return { skipped: true, reason: "missing_va_details" }
  }

  const stripe = getStripe()
  const vaSnapshot: VaSnapshot = {
    accountNumber: va.accountNumber,
    routingNumber: va.routingNumber,
    iban: va.iban,
  }
  const storedId = row.stripe_external_account_id?.trim() || ""

  if (storedId) {
    const storedBank = await retrieveStoredBank(stripe, row.stripe_account_id, storedId)
    if (storedBank && gridVaMatchesBankAccount(vaSnapshot, fiat, storedBank)) {
      const action = await ensureDefaultBank(stripe, row.stripe_account_id, storedBank)
      await persistExternalAccountId(admin, input.businessId, storedBank.id, rail)
      return { skipped: false, ok: true, action, stripeExternalAccountId: storedBank.id }
    }
  }

  const listed = await stripe.accounts.listExternalAccounts(row.stripe_account_id, {
    object: "bank_account",
    limit: 100,
  })
  const banks = listed.data.filter(
    (entry): entry is Stripe.BankAccount => entry.object === "bank_account",
  )
  const currencyBanks = banks.filter((bank) => String(bank.currency ?? "").toLowerCase() === fiat)
  const matching = currencyBanks.filter((bank) => gridVaMatchesBankAccount(vaSnapshot, fiat, bank))
  const target = pickCanonicalGridVaBank(matching, storedId)
  const defaultBank = currencyBanks.find((bank) => bank.default_for_currency) ?? null

  if (target) {
    if (matching.length > 1) {
      console.warn(
        "[stripe-connect] duplicate VA bank accounts on Connect; reusing one",
        input.businessId,
        matching.map((bank) => bank.id),
      )
    }
    const action = await ensureDefaultBank(stripe, row.stripe_account_id, target)
    await persistExternalAccountId(admin, input.businessId, target.id, rail)
    return { skipped: false, ok: true, action, stripeExternalAccountId: target.id }
  }

  if (defaultBank && !gridVaMatchesBankAccount(vaSnapshot, fiat, defaultBank)) {
    console.warn(
      "[stripe-connect] payout destination drift detected; re-linking VA",
      input.businessId,
      defaultBank.id,
    )
  }

  const linked = await createGridVaExternalAccountOnStripe(admin, {
    businessId: input.businessId,
    stripeAccountId: row.stripe_account_id,
    currency,
    va,
    settlementRail: rail,
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
