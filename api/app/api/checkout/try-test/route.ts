import { NextResponse } from "next/server"
import { createOnlineCheckoutSession } from "@/lib/stripe/create-online-checkout-session"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"
import { buildPaymentThanksUrl } from "@/lib/payment-links/public-url"

/** Dashboard “Try test checkout”: create a $49 test session for the logged-in business. */
export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data: site } = await admin
    .from("business_checkout_sites")
    .select("success_url, origin")
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  const returnUrl =
    (typeof site?.success_url === "string" && site.success_url.trim()) ||
    (typeof site?.origin === "string" ? `${site.origin.replace(/\/$/, "")}/thanks` : "") ||
    buildPaymentThanksUrl()

  const { data: testKey } = await admin
    .from("business_api_keys")
    .select("id, publishable_key")
    .eq("business_id", ctx.businessId)
    .eq("mode", "test")
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!testKey?.publishable_key) {
    return NextResponse.json({ error: "Create test keys first." }, { status: 400 })
  }

  const result = await createOnlineCheckoutSession(admin, {
    source: "embed",
    businessId: ctx.businessId,
    mode: "payment",
    listedAmountCents: 4900,
    currency: "USD",
    productName: "Easner test checkout",
    returnUrl,
    metadata: { hub_try_test: "true" },
    apiKeyId: String(testKey.id),
    livemode: false,
    idempotencyKey: `try_test_${ctx.businessId}_${Math.floor(Date.now() / 60_000)}`,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    client_secret: result.clientSecret,
    checkout_session_id: result.checkoutSessionId,
    stripe_account_id: result.stripeAccountId,
    publishable_key: testKey.publishable_key,
  })
}
