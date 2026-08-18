import { NextResponse } from "next/server"
import { getBusinessAppPublicOrigin } from "@/lib/business-app-public-url"
import { createOnlineCheckoutSession } from "@/lib/stripe/create-online-checkout-session"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

const TEST_AMOUNT_CENTS = 100

/**
 * Session behind the in-page payment preview on /checkout. Same rail as a real
 * embed session so a successful test proves the whole path, ending on /checkout.
 */
export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data: biz } = await admin
    .from("businesses")
    .select("name")
    .eq("id", ctx.businessId)
    .maybeSingle()

  const result = await createOnlineCheckoutSession(admin, {
    source: "embed",
    businessId: ctx.businessId,
    mode: "payment",
    listedAmountCents: TEST_AMOUNT_CENTS,
    currency: "USD",
    productName: "Checkout test payment",
    productDescription: `Test payment for ${typeof biz?.name === "string" ? biz.name : "your business"}`,
    returnUrl: `${getBusinessAppPublicOrigin()}/checkout?test_session={CHECKOUT_SESSION_ID}`,
    metadata: { easner_checkout_test: "true" },
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    clientSecret: result.clientSecret,
    publishableKey: result.publishableKey,
    amountCents: result.amounts.customerAmountCents,
  })
}
