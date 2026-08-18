import { NextResponse } from "next/server"
import { logAdminAction } from "@/lib/admin-audit"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import {
  OFFICE_FEE_MODE_OVERRIDES,
  parseCheckoutFeeMode,
  resolveCheckoutFeeMode,
} from "@/lib/stripe/checkout-fee-mode"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export const runtime = "nodejs"

function businessIdFromUrl(request: Request): string {
  return String(new URL(request.url).searchParams.get("business_id") ?? "").trim()
}

/** Ops view of who pays checkout processing fees for a business. */
export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const businessId = businessIdFromUrl(request)
  if (!businessId) {
    return NextResponse.json({ error: "business_id required" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const resolved = await resolveCheckoutFeeMode(admin, businessId)

  return NextResponse.json({
    feeMode: resolved.feeMode,
    businessFeeMode: resolved.businessFeeMode,
    overrideFeeMode: resolved.overrideFeeMode,
    overrideReason: resolved.overrideReason,
    availableModes: OFFICE_FEE_MODE_OVERRIDES,
  })
}

/** Set the override. Supersedes whatever the business chose in its own checkout settings. */
export async function PUT(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as {
    business_id?: string
    fee_mode?: string
    reason?: string | null
  } | null

  const businessId = String(body?.business_id ?? "").trim()
  const feeMode = parseCheckoutFeeMode(body?.fee_mode)
  if (!businessId || !feeMode) {
    return NextResponse.json(
      { error: "business_id and fee_mode required (merchant_net|buyer_surcharge|easner_absorbs)" },
      { status: 400 },
    )
  }

  const admin = createSupabaseAdmin()
  const { error } = await admin.from("business_checkout_fee_overrides").upsert(
    {
      business_id: businessId,
      fee_mode: feeMode,
      reason: String(body?.reason ?? "").trim() || null,
      updated_by: auth.ctx.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id" },
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  await logAdminAction(auth.ctx.userId, "checkout_fee_override.upsert", businessId, {
    fee_mode: feeMode,
  })

  return NextResponse.json({ overrideFeeMode: feeMode })
}

/** Clear the override and hand the choice back to the business. */
export async function DELETE(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const businessId = businessIdFromUrl(request)
  if (!businessId) {
    return NextResponse.json({ error: "business_id required" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { error } = await admin
    .from("business_checkout_fee_overrides")
    .delete()
    .eq("business_id", businessId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  await logAdminAction(auth.ctx.userId, "checkout_fee_override.delete", businessId, {})

  return NextResponse.json({ ok: true })
}
