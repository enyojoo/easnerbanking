import { NextResponse } from "next/server"
import { authenticatePublishableKey } from "@/lib/checkout/authenticate-merchant-key"
import { checkoutApiError } from "@/lib/checkout/checkout-api-error"
import { getStripePublishableKey, isStripeTestPaymentsConfigured } from "@/lib/stripe/config"
import { getConnectAccountRow } from "@/lib/stripe/connect"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "Content-Type",
}

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: CORS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

/** Browser mount checks that a publishable key is still active. */
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key")?.trim() || ""
  if (!key) {
    const { body } = checkoutApiError(400, "missing_key", "key is required")
    return json(400, body)
  }

  const admin = createSupabaseAdmin()
  const auth = await authenticatePublishableKey(admin, key)
  if (!auth.ok) {
    const { body } = checkoutApiError(auth.status, "invalid_publishable_key", auth.error)
    return json(auth.status, body)
  }

  if (auth.ctx.mode === "test" && !isStripeTestPaymentsConfigured()) {
    const { body } = checkoutApiError(
      503,
      "test_payments_unconfigured",
      "Test payments are not configured.",
    )
    return json(503, body)
  }

  const connect = await getConnectAccountRow(admin, auth.ctx.businessId)
  return json(200, {
    ok: true,
    mode: auth.ctx.mode,
    publishable_key: getStripePublishableKey(auth.ctx.mode === "live"),
    account_id: connect?.stripe_account_id?.trim() || null,
  })
}
