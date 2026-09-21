import { NextResponse } from "next/server"
import { createOnlineCheckoutSession } from "@/lib/stripe/create-online-checkout-session"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response
  const livemode = new URL(request.url).searchParams.get("livemode") === "live"
  if (livemode) {
    return NextResponse.json({ error: "Create test sessions while Test is selected." }, { status: 400 })
  }

  const body = (await request.json().catch(() => null)) as { siteId?: string; amount?: number } | null
  const admin = createSupabaseAdmin()
  let siteQuery = admin
    .from("business_checkout_sites")
    .select("id, origin, success_url, cancel_url")
    .eq("business_id", ctx.businessId)
  if (body?.siteId) siteQuery = siteQuery.eq("id", body.siteId)
  const { data: sites } = await siteQuery
  const site = (sites ?? []).find((row) => row.success_url) ?? (sites ?? [])[0]
  if (!site?.success_url) {
    return NextResponse.json({ error: "Add a success URL on this website first." }, { status: 400 })
  }

  const amountCents = Math.round(Number(body?.amount ?? 100))
  const result = await createOnlineCheckoutSession(admin, {
    source: "embed",
    businessId: ctx.businessId,
    mode: "payment",
    listedAmountCents: amountCents,
    currency: "USD",
    productName: "Test Checkout",
    returnUrl: site.success_url,
    livemode: false,
    metadata: { easner_test_session: "true" },
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({
    checkout_session_id: result.checkoutSessionId,
    client_secret: result.clientSecret,
    publishable_key: result.publishableKey,
  })
}
