import { NextResponse } from "next/server"
import { mapCheckoutSite } from "@/lib/checkout/map-checkout-site"
import { normalizeOrigin, normalizeReturnUrl } from "@/lib/checkout/normalize-checkout-url"
import { syncCheckoutAllowedOrigins } from "@/lib/checkout/sync-allowed-origins"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => null)) as {
    origin?: string
    success_url?: string | null
    cancel_url?: string | null
  } | null

  const origin = normalizeOrigin(String(body?.origin ?? ""))
  if (!origin) {
    return NextResponse.json({ error: "Enter a valid https:// website address" }, { status: 400 })
  }

  let successUrl: string | null = null
  let cancelUrl: string | null = null
  if (body?.success_url != null && String(body.success_url).trim()) {
    successUrl = normalizeReturnUrl(String(body.success_url))
    if (!successUrl) {
      return NextResponse.json({ error: "Enter a full https:// success URL" }, { status: 400 })
    }
  }
  if (body?.cancel_url != null && String(body.cancel_url).trim()) {
    cancelUrl = normalizeReturnUrl(String(body.cancel_url))
    if (!cancelUrl) {
      return NextResponse.json({ error: "Enter a full https:// cancel URL" }, { status: 400 })
    }
  }

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("business_checkout_sites")
    .insert({
      business_id: ctx.businessId,
      origin,
      success_url: successUrl,
      cancel_url: cancelUrl,
    })
    .select("id, origin, success_url, cancel_url, created_at, updated_at")
    .maybeSingle()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "That website is already on Checkout." }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (!data) return NextResponse.json({ error: "Could not add website" }, { status: 400 })

  await syncCheckoutAllowedOrigins(admin, ctx.businessId)
  return NextResponse.json({ site: mapCheckoutSite(data) })
}
