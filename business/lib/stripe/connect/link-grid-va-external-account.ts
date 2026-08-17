import type { SupabaseClient } from "@supabase/supabase-js"
import { getVirtualAccountDisplayFromDb } from "@/lib/noah/virtual-accounts-db"
import { reconcileGridVaPayoutDestination } from "./reconcile-grid-va-payout"
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
 * Verifies Stripe state and re-asserts when the default destination has drifted.
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
      error: "Complete online payment verification first",
      status: 400,
    }
  }

  const reconciled = await reconcileGridVaPayoutDestination(admin, {
    businessId: input.businessId,
    currency,
  })

  if (!reconciled.skipped && reconciled.ok) {
    const va = await getVirtualAccountDisplayFromDb(admin, {
      currency: fiat,
      businessId: input.businessId,
    })
    return {
      ok: true,
      stripeExternalAccountId: reconciled.stripeExternalAccountId,
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

  if (!reconciled.skipped && !reconciled.ok) {
    return { ok: false, error: reconciled.error, status: 502 }
  }

  if (reconciled.skipped && reconciled.reason === "details_not_submitted") {
    return { ok: false, error: "Complete online payment verification first", status: 400 }
  }
  if (reconciled.skipped && reconciled.reason === "no_grid_va") {
    return { ok: false, error: `No active ${currency} virtual account found`, status: 400 }
  }
  if (reconciled.skipped && reconciled.reason === "missing_va_details") {
    return { ok: false, error: "Virtual account is missing payout details", status: 400 }
  }

  return { ok: false, error: "Could not link payout destination", status: 400 }
}
