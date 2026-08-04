import { NextResponse } from "next/server"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import {
  autoLinkGridVaPayoutIfEligible,
  getConnectAccountRow,
  resolveConnectReadyForCheckout,
  syncConnectAccountRow,
} from "@/lib/stripe/connect"
import { isStripeInvoicePaymentsEnabled } from "@/lib/stripe/config"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Connect onboarding + payout readiness for the current business. */
export async function GET(request: Request) {
  if (!isStripeInvoicePaymentsEnabled()) {
    return NextResponse.json({
      enabled: false,
      connectEnabled: false,
      ready: false,
      reason: "Stripe invoice payments are not enabled",
    })
  }

  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const url = new URL(request.url)
  const currency = url.searchParams.get("currency") || "USD"

  const row = await getConnectAccountRow(admin, ctx.businessId)

  // Keep DB in sync even when account.updated Connect webhooks are missing.
  if (row?.stripe_account_id) {
    try {
      await syncConnectAccountRow(admin, {
        businessId: ctx.businessId,
        stripeAccountId: row.stripe_account_id,
      })
      const autoLink = await autoLinkGridVaPayoutIfEligible(admin, {
        businessId: ctx.businessId,
        currency,
      })
      if (!autoLink.skipped && !autoLink.ok) {
        console.warn("[stripe-connect] status auto-link failed:", autoLink.error)
      }
    } catch (e) {
      console.warn("[stripe-connect] status sync failed:", e)
    }
  }

  const freshReady = await resolveConnectReadyForCheckout(admin, ctx.businessId, { currency })
  const freshRow = await getConnectAccountRow(admin, ctx.businessId)

  return NextResponse.json({
    enabled: true,
    connectEnabled: true,
    ready: freshReady.ready,
    reason: freshReady.reason,
    stripeAccountId: freshReady.stripeAccountId,
    onboardingStatus: freshReady.onboardingStatus,
    transfersEnabled: freshReady.transfersEnabled,
    payoutsEnabled: freshReady.payoutsEnabled,
    detailsSubmitted: freshReady.detailsSubmitted,
    externalAccountLinked: freshReady.externalAccountLinked,
    hasGridVa: freshReady.hasGridVa,
    requirementsCurrentlyDue: freshReady.requirementsCurrentlyDue,
    payoutDestination: freshRow?.stripe_external_account_id
      ? {
          stripeExternalAccountId: freshRow.stripe_external_account_id,
          settlementRail: freshRow.default_settlement_rail,
          schedule: freshRow.stripe_payout_schedule,
        }
      : null,
  })
}
