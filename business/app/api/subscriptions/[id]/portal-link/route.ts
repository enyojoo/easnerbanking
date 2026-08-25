import { NextResponse } from "next/server"
import { getPayAppPublicOrigin } from "@/lib/customer-hosts"
import { getStripe } from "@/lib/stripe/client"
import { issuePortalToken } from "@/lib/subscriptions/portal-tokens"
import { subscriptionBelongsToBusiness } from "@/lib/subscriptions/summary"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

/**
 * Mint a self-serve manage link for one subscription – the customer can update
 * their card or cancel there without contacting the business.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const { id } = await context.params
  const stripe = getStripe()
  try {
    const subscription = await stripe.subscriptions.retrieve(id)
    if (!subscriptionBelongsToBusiness(subscription, ctx.businessId)) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 })
    }

    const admin = createSupabaseAdmin()
    const { data: session } = await admin
      .from("online_checkout_sessions")
      .select("customer_email")
      .eq("business_id", ctx.businessId)
      .eq("stripe_subscription_id", id)
      .not("customer_email", "is", null)
      .limit(1)
      .maybeSingle()

    const issued = await issuePortalToken(admin, {
      businessId: ctx.businessId,
      stripeSubscriptionId: id,
      stripeCustomerId:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id ?? null,
      customerEmail: session?.customer_email ? String(session.customer_email) : "",
    })
    if (!issued.ok) {
      return NextResponse.json({ error: issued.error }, { status: 500 })
    }

    return NextResponse.json({
      url: `${getPayAppPublicOrigin()}/manage/${issued.token}`,
      expires_at: issued.expiresAt,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create the manage link"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
