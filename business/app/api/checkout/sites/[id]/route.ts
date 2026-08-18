import { NextResponse } from "next/server"
import { mapCheckoutSite } from "@/lib/checkout/map-checkout-site"
import { normalizeOrigin, normalizeReturnUrl } from "@/lib/checkout/normalize-checkout-url"
import { syncCheckoutAllowedOrigins } from "@/lib/checkout/sync-allowed-origins"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const { id } = await params
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const body = (await request.json().catch(() => null)) as {
    origin?: string
    success_url?: string | null
    cancel_url?: string | null
  } | null

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body?.origin !== undefined) {
    const origin = normalizeOrigin(String(body.origin))
    if (!origin) {
      return NextResponse.json({ error: "Enter a valid https:// website address" }, { status: 400 })
    }
    patch.origin = origin
  }
  if (body?.success_url !== undefined) {
    const raw = String(body.success_url ?? "")
    if (!raw.trim()) patch.success_url = null
    else {
      const url = normalizeReturnUrl(raw)
      if (!url) return NextResponse.json({ error: "Enter a full https:// success URL" }, { status: 400 })
      patch.success_url = url
    }
  }
  if (body?.cancel_url !== undefined) {
    const raw = String(body.cancel_url ?? "")
    if (!raw.trim()) patch.cancel_url = null
    else {
      const url = normalizeReturnUrl(raw)
      if (!url) return NextResponse.json({ error: "Enter a full https:// cancel URL" }, { status: 400 })
      patch.cancel_url = url
    }
  }

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("business_checkout_sites")
    .update(patch)
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .select("id, origin, success_url, cancel_url, created_at, updated_at")
    .maybeSingle()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "That website is already on Checkout." }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await syncCheckoutAllowedOrigins(admin, ctx.businessId)
  return NextResponse.json({ site: mapCheckoutSite(data) })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromApiRequest(_request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const { id } = await params
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const admin = createSupabaseAdmin()
  const { error } = await admin
    .from("business_checkout_sites")
    .delete()
    .eq("id", id)
    .eq("business_id", ctx.businessId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await syncCheckoutAllowedOrigins(admin, ctx.businessId)
  return NextResponse.json({ ok: true })
}
