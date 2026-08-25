import { NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe/client"
import { subscriptionBelongsToBusiness } from "@/lib/subscriptions/summary"
import { getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

/** Merchant-side cancel: immediate, or at period end with `at_period_end: true`. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const { id } = await context.params
  const body = (await request.json().catch(() => ({}))) as { at_period_end?: boolean }

  const stripe = getStripe()
  try {
    const subscription = await stripe.subscriptions.retrieve(id)
    if (!subscriptionBelongsToBusiness(subscription, ctx.businessId)) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 })
    }
    const updated = body?.at_period_end
      ? await stripe.subscriptions.update(id, { cancel_at_period_end: true })
      : await stripe.subscriptions.cancel(id)
    return NextResponse.json({ ok: true, status: updated.status })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not cancel this subscription"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
