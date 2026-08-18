import { NextResponse } from "next/server"
import { isTerminalSessionId } from "@/lib/payment-links/public-id"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

type Ctx = { params: Promise<{ id: string }> }

/**
 * Payer-facing read for a stablecoin charge on pay.easner.com. The session id is
 * the capability token (same model as invoice-by-id links), so only the fields a
 * payer needs are returned — never payout, recipient, or provider details.
 */
export async function GET(_request: Request, context: Ctx) {
  const { id } = await context.params
  const sessionId = String(id || "").trim()
  if (!isTerminalSessionId(sessionId)) {
    return NextResponse.json({ error: "Invalid session id." }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("terminal_sessions")
    .select(
      "id, status, destination_address, crypto_currency, network, fiat_amount, fiat_currency, crypto_amount_expected, expires_at, business_id",
    )
    .eq("id", sessionId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 })
  }

  const { business_id: businessId, ...session } = data as Record<string, unknown> & {
    business_id: string
  }

  const { data: biz } = await admin
    .from("businesses")
    .select("name, logo_url, easetag")
    .eq("id", businessId)
    .maybeSingle()

  return NextResponse.json({
    session,
    business: {
      name: typeof biz?.name === "string" ? biz.name : null,
      logoUrl: typeof biz?.logo_url === "string" ? biz.logo_url : null,
      easetag: typeof biz?.easetag === "string" ? biz.easetag : null,
    },
  })
}
