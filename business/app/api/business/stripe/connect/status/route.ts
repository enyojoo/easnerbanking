import { NextResponse } from "next/server"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import {
  ensureConnectAccountLinked,
  getConnectAccountRow,
  resolveConnectReadyForCheckout,
  runConnectAccountSyncPipeline,
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

  try {
    await ensureConnectAccountLinked(admin, ctx.businessId)
  } catch (e) {
    console.warn("[stripe-connect] discover/link failed:", e)
  }

  const row = await getConnectAccountRow(admin, ctx.businessId)

  if (row?.stripe_account_id) {
    try {
      await runConnectAccountSyncPipeline(admin, {
        businessId: ctx.businessId,
        stripeAccountId: row.stripe_account_id,
      })
    } catch (e) {
      console.warn("[stripe-connect] status sync failed:", e)
    }
  }

  const freshReady = await resolveConnectReadyForCheckout(admin, ctx.businessId, { currency })
  const freshRow = await getConnectAccountRow(admin, ctx.businessId)
  const payoutSnapshot = freshRow?.payout_destination_snapshot as
    | {
        stripeExternalAccountId?: string
        last4?: string | null
        bankName?: string | null
        currency?: string
        status?: string | null
      }
    | null
    | undefined

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
    requirementsSnapshot: freshRow?.requirements_snapshot ?? null,
    businessProfileSnapshot: freshRow?.business_profile_snapshot ?? null,
    capabilities: freshRow?.capabilities ?? null,
    payoutDestination: freshRow?.stripe_external_account_id
      ? {
          stripeExternalAccountId: freshRow.stripe_external_account_id,
          settlementRail: freshRow.default_settlement_rail,
          schedule: freshRow.stripe_payout_schedule,
          last4: payoutSnapshot?.last4 ?? null,
          bankName: payoutSnapshot?.bankName ?? null,
          currency: payoutSnapshot?.currency ?? null,
          status: payoutSnapshot?.status ?? null,
        }
      : null,
    lastSyncedAt: freshRow?.last_synced_at ?? null,
  })
}
