import { NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe/client"
import { subscriptionBelongsToBusiness, summarizeSubscription } from "@/lib/subscriptions/summary"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

const MAX_LIVE_LOOKUPS = 25

/**
 * Recurring payments across links and website checkout. Sourced from checkout
 * sessions that opened a subscription, with live status from the processor.
 */
export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data: sessions } = await admin
    .from("online_checkout_sessions")
    .select("stripe_subscription_id, payment_link_id, customer_email, created_at")
    .eq("business_id", ctx.businessId)
    .not("stripe_subscription_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(100)

  const seen = new Set<string>()
  const rows: Array<{ subscriptionId: string; paymentLinkId: string | null; customerEmail: string | null; startedAt: string }> = []
  for (const session of sessions ?? []) {
    const id = String(session.stripe_subscription_id ?? "").trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    rows.push({
      subscriptionId: id,
      paymentLinkId: session.payment_link_id ? String(session.payment_link_id) : null,
      customerEmail: session.customer_email ? String(session.customer_email) : null,
      startedAt: String(session.created_at ?? ""),
    })
  }

  const linkIds = [...new Set(rows.map((row) => row.paymentLinkId).filter(Boolean).map(String))]
  const linkLabels = new Map<string, string>()
  if (linkIds.length) {
    const { data: links } = await admin.from("payment_links").select("id, label").in("id", linkIds)
    for (const link of links ?? []) linkLabels.set(String(link.id), String(link.label ?? ""))
  }

  const stripe = getStripe()
  const subscriptions = await Promise.all(
    rows.slice(0, MAX_LIVE_LOOKUPS).map(async (row) => {
      try {
        const subscription = await stripe.subscriptions.retrieve(row.subscriptionId, {
          expand: ["default_payment_method"],
        })
        if (!subscriptionBelongsToBusiness(subscription, ctx.businessId)) return null
        return {
          id: row.subscriptionId,
          label: row.paymentLinkId ? linkLabels.get(row.paymentLinkId) ?? null : null,
          customerEmail: row.customerEmail,
          startedAt: row.startedAt,
          paymentLinkId: row.paymentLinkId,
          ...summarizeSubscription(subscription),
        }
      } catch {
        return null
      }
    }),
  )

  return NextResponse.json({ subscriptions: subscriptions.filter(Boolean) })
}
