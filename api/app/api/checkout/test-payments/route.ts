import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

type SessionRow = {
  id: string
  source: string
  status: string
  gross_cents: number | null
  currency: string | null
  customer_email: string | null
  completed_at: string | null
  created_at: string
  livemode: boolean
  stripe_checkout_session_id: string | null
  metadata: Record<string, unknown> | null
  return_url: string | null
}

/**
 * Checkout sessions for Console. Test or live from `livemode`.
 */
export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const livemode = new URL(request.url).searchParams.get("livemode") === "live"
  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("online_checkout_sessions")
    .select(
      "id, source, status, gross_cents, currency, customer_email, completed_at, created_at, livemode, stripe_checkout_session_id, metadata, return_url",
    )
    .eq("business_id", ctx.businessId)
    .eq("livemode", livemode)
    .in("source", ["embed", "payment_link"])
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    const missingColumn = error.code === "42703" || /livemode/i.test(error.message || "")
    if (missingColumn) return NextResponse.json({ payments: [], sessions: [] })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const sessions = ((data ?? []) as SessionRow[]).map((row) => ({
    id: row.stripe_checkout_session_id || row.id,
    internalId: row.id,
    source: row.source === "payment_link" ? "payment_link" : "embed",
    status: row.status,
    amountCents: Number(row.gross_cents ?? 0),
    currency: String(row.currency ?? "USD").toUpperCase(),
    customerEmail: row.customer_email,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    livemode: row.livemode,
    origin: originOf(row.return_url),
  }))

  return NextResponse.json({
    payments: sessions
      .filter((row) => row.status === "complete")
      .map((row) => ({
        id: row.id,
        source: row.source,
        amountCents: row.amountCents,
        currency: row.currency,
        customerEmail: row.customerEmail,
        completedAt: row.completedAt,
      })),
    sessions,
  })
}

function originOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url.replace("{CHECKOUT_SESSION_ID}", "placeholder")).origin
  } catch {
    return null
  }
}
