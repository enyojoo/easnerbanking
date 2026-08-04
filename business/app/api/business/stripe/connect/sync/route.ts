import { NextResponse } from "next/server"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import {
  getConnectAccountRow,
  resolveConnectReadyForCheckout,
  runConnectAccountSyncPipeline,
} from "@/lib/stripe/connect"
import { isStripeInvoicePaymentsEnabled } from "@/lib/stripe/config"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Pull latest Stripe Account status into DB. */
export async function POST(request: Request) {
  if (!isStripeInvoicePaymentsEnabled()) {
    return NextResponse.json({ error: "Stripe invoice payments are not enabled" }, { status: 503 })
  }

  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const row = await getConnectAccountRow(admin, ctx.businessId)
  if (!row?.stripe_account_id) {
    return NextResponse.json({ error: "No Connect account yet" }, { status: 404 })
  }

  try {
    await runConnectAccountSyncPipeline(admin, {
      businessId: ctx.businessId,
      stripeAccountId: row.stripe_account_id,
    })
    const synced = await getConnectAccountRow(admin, ctx.businessId)
    const ready = await resolveConnectReadyForCheckout(admin, ctx.businessId)
    if (!synced) {
      return NextResponse.json({ error: "Sync failed" }, { status: 500 })
    }
    return NextResponse.json({
      ok: true,
      ready: ready.ready,
      onboardingStatus: synced.onboarding_status,
      transfersEnabled: synced.transfers_enabled,
      payoutsEnabled: synced.payouts_enabled,
      detailsSubmitted: synced.details_submitted,
      requirementsCurrentlyDue: synced.requirements_currently_due,
      externalAccountLinked: ready.externalAccountLinked,
      requirementsSnapshot: synced.requirements_snapshot,
      payoutDestinationSnapshot: synced.payout_destination_snapshot,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
