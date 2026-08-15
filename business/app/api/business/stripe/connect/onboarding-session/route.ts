import { NextResponse } from "next/server"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import { isBusinessTier1Complete } from "@/lib/compliance/business-tier1"
import {
  CONNECT_KYB_REQUIRED_REASON,
  createConnectAccountSession,
  stripeConnectClientIp,
} from "@/lib/stripe/connect"
import { isStripeInvoicePaymentsEnabled } from "@/lib/stripe/config"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Create Stripe Account Session client_secret for embedded Connect onboarding. */
export async function POST(request: Request) {
  if (!isStripeInvoicePaymentsEnabled()) {
    return NextResponse.json({ error: "Stripe invoice payments are not enabled" }, { status: 503 })
  }

  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data: biz } = await admin
    .from("businesses")
    .select("verification_status, verification_provider, grid_customer_id")
    .eq("id", ctx.businessId)
    .maybeSingle()
  if (!isBusinessTier1Complete(biz)) {
    return NextResponse.json({ error: CONNECT_KYB_REQUIRED_REASON }, { status: 403 })
  }

  const { data: userRow } = await admin
    .from("users")
    .select("email")
    .eq("id", ctx.userId)
    .maybeSingle()

  const result = await createConnectAccountSession(admin, {
    businessId: ctx.businessId,
    email: typeof userRow?.email === "string" ? userRow.email : null,
    clientIp: stripeConnectClientIp(request),
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    clientSecret: result.clientSecret,
    stripeAccountId: result.stripeAccountId,
  })
}
