import { NextResponse } from "next/server"
import { publicMerchantMetadata } from "@/lib/stripe/checkout-session-metadata"
import { publicTransaction } from "@/lib/platform/ledger"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const business = await requireEasnerBusinessId(user.id)
  if (!business.ok) return business.response
  const { id } = await ctx.params
  const admin = createSupabaseAdmin()

  const { data: session } = await admin
    .from("online_checkout_sessions")
    .select(
      "id, source, status, gross_cents, currency, customer_email, completed_at, created_at, livemode, stripe_checkout_session_id, metadata, return_url",
    )
    .eq("business_id", business.businessId)
    .or(`stripe_checkout_session_id.eq.${id},id.eq.${id}`)
    .maybeSingle()
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const csId = String(session.stripe_checkout_session_id || session.id)
  const metadata =
    session.metadata && typeof session.metadata === "object" && !Array.isArray(session.metadata)
      ? publicMerchantMetadata(session.metadata as Record<string, unknown>)
      : {}

  const [{ data: events }, { data: transactions }] = await Promise.all([
    admin
      .from("platform_events")
      .select("id, type, payload, created_at")
      .eq("business_id", business.businessId)
      .eq("livemode", Boolean(session.livemode))
      .eq("type", "checkout.completed")
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("platform_transactions")
      .select(
        "id, type, amount_cents, currency, direction, status, account_id, customer_id, transfer_id, checkout_session_id, description, livemode, created_at",
      )
      .eq("business_id", business.businessId)
      .eq("checkout_session_id", csId)
      .limit(10),
  ])

  const relatedEvents = (events ?? []).filter((event) => {
    const payload = event.payload as Record<string, unknown>
    const data = payload?.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : payload
    return String(data?.checkout_session_id ?? payload?.checkout_session_id ?? "") === csId
  })
  const eventIds = relatedEvents.map((event) => event.id)
  const { data: deliveries } = eventIds.length
    ? await admin
        .from("platform_webhook_deliveries")
        .select("id, endpoint_id, status, last_status_code, created_at, event_id")
        .in("event_id", eventIds)
    : { data: [] }

  return NextResponse.json({
    session: {
      id: csId,
      status: session.status,
      amountCents: Number(session.gross_cents ?? 0),
      currency: String(session.currency ?? "USD").toUpperCase(),
      customerEmail: session.customer_email,
      completedAt: session.completed_at,
      createdAt: session.created_at,
      livemode: session.livemode,
      source: session.source,
      metadata,
    },
    events: relatedEvents,
    deliveries: deliveries ?? [],
    transactions: (transactions ?? []).map((row) => publicTransaction(row)),
  })
}
