import { NextResponse } from "next/server"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import { autoLinkGridVaPayoutIfEligible, getConnectAccountRow, syncConnectAccountRow } from "@/lib/stripe/connect"
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
    const synced = await syncConnectAccountRow(admin, {
      businessId: ctx.businessId,
      stripeAccountId: row.stripe_account_id,
    })
    const autoLink = await autoLinkGridVaPayoutIfEligible(admin, {
      businessId: ctx.businessId,
    })
    if (!autoLink.skipped && !autoLink.ok) {
      console.warn("[stripe-connect] sync auto-link failed:", autoLink.error)
    }
    const externalAccountLinked =
      autoLink.skipped && autoLink.reason === "already_linked"
        ? true
        : !autoLink.skipped && autoLink.ok
          ? true
          : Boolean(synced.stripe_external_account_id)
    return NextResponse.json({
      ok: true,
      onboardingStatus: synced.onboarding_status,
      transfersEnabled: synced.transfers_enabled,
      payoutsEnabled: synced.payouts_enabled,
      detailsSubmitted: synced.details_submitted,
      requirementsCurrentlyDue: synced.requirements_currently_due,
      externalAccountLinked,
      autoLink,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
