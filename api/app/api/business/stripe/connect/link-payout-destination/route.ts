import { NextResponse } from "next/server"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import { linkGridVaExternalAccount } from "@/lib/stripe/connect"
import { isStripeInvoicePaymentsEnabled } from "@/lib/stripe/config"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Link the Office-routed virtual account as the Stripe connected-account payout destination. */
export async function POST(request: Request) {
  if (!isStripeInvoicePaymentsEnabled()) {
    return NextResponse.json({ error: "Stripe invoice payments are not enabled" }, { status: 503 })
  }

  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response

  let currency = "USD"
  try {
    const body = (await request.json().catch(() => ({}))) as { currency?: string }
    if (typeof body.currency === "string" && body.currency.trim()) {
      currency = body.currency.trim().toUpperCase()
    }
  } catch {
    // default USD
  }

  const admin = createSupabaseAdmin()
  const result = await linkGridVaExternalAccount(admin, {
    businessId: ctx.businessId,
    currency,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    ok: true,
    stripeExternalAccountId: result.stripeExternalAccountId,
    currency: result.currency,
    maskedDestination: result.maskedDestination,
    payoutInterval: result.payoutInterval,
  })
}
