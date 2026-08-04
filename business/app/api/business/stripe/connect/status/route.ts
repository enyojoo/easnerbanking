import { NextResponse } from "next/server"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import {
  getConnectAccountRow,
  resolveConnectReadyForCheckout,
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

  const readyStatus = await resolveConnectReadyForCheckout(admin, ctx.businessId, { currency })
  const row = await getConnectAccountRow(admin, ctx.businessId)

  return NextResponse.json({
    enabled: true,
    connectEnabled: true,
    ready: readyStatus.ready,
    reason: readyStatus.reason,
    stripeAccountId: readyStatus.stripeAccountId,
    onboardingStatus: readyStatus.onboardingStatus,
    transfersEnabled: readyStatus.transfersEnabled,
    payoutsEnabled: readyStatus.payoutsEnabled,
    detailsSubmitted: readyStatus.detailsSubmitted,
    externalAccountLinked: readyStatus.externalAccountLinked,
    hasGridVa: readyStatus.hasGridVa,
    requirementsCurrentlyDue: readyStatus.requirementsCurrentlyDue,
    payoutDestination: row?.stripe_external_account_id
      ? {
          stripeExternalAccountId: row.stripe_external_account_id,
          settlementRail: row.default_settlement_rail,
          schedule: row.stripe_payout_schedule,
        }
      : null,
  })
}
