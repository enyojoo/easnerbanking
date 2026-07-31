import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { logAdminAction } from "@/lib/admin-audit"
import {
  deleteProcessingFeeOverrideAdmin,
  getProcessingFeeOverrideAdmin,
  parseProcessingFeeOverrideSubjectType,
  upsertProcessingFeeOverrideAdmin,
} from "@/lib/admin/processing-fee-overrides-service"
import { clearProcessingFeeBpsCache } from "@/lib/processing-fee/resolve-processing-fee-bps"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const subjectType = parseProcessingFeeOverrideSubjectType(url.searchParams.get("subject_type"))
  const subjectId = String(url.searchParams.get("subject_id") ?? "").trim()

  if (!subjectType || !subjectId) {
    return NextResponse.json(
      { error: "subject_type and subject_id required (subject_type: business|user)" },
      { status: 400 },
    )
  }

  try {
    const admin = createSupabaseAdmin()
    const override = await getProcessingFeeOverrideAdmin(admin, subjectType, subjectId)
    return NextResponse.json({ override })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load processing fee override" },
      { status: 500 },
    )
  }
}

export async function PUT(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const subjectType = parseProcessingFeeOverrideSubjectType(String(body?.subject_type ?? ""))
  const subjectId = String(body?.subject_id ?? "").trim()

  if (!subjectType || !subjectId) {
    return NextResponse.json(
      { error: "subject_type and subject_id required (subject_type: business|user)" },
      { status: 400 },
    )
  }

  try {
    const admin = createSupabaseAdmin()
    const override = await upsertProcessingFeeOverrideAdmin(
      admin,
      {
        subject_type: subjectType,
        subject_id: subjectId,
        pay_in_bps: body?.pay_in_bps as number | null | undefined,
        pay_out_bps: body?.pay_out_bps as number | null | undefined,
        cross_border_bps: body?.cross_border_bps as number | null | undefined,
        reason: body?.reason as string | null | undefined,
      },
      auth.ctx.userId,
    )
    clearProcessingFeeBpsCache()
    await logAdminAction(auth.ctx.userId, "processing_fee_override.upsert", subjectId, {
      subject_type: subjectType,
      pay_in_bps: override.pay_in_bps,
      pay_out_bps: override.pay_out_bps,
      cross_border_bps: override.cross_border_bps,
    })
    return NextResponse.json({ override })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid processing fee override payload" },
      { status: 400 },
    )
  }
}

export async function DELETE(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const subjectType = parseProcessingFeeOverrideSubjectType(url.searchParams.get("subject_type"))
  const subjectId = String(url.searchParams.get("subject_id") ?? "").trim()

  if (!subjectType || !subjectId) {
    return NextResponse.json(
      { error: "subject_type and subject_id required (subject_type: business|user)" },
      { status: 400 },
    )
  }

  try {
    const admin = createSupabaseAdmin()
    await deleteProcessingFeeOverrideAdmin(admin, subjectType, subjectId)
    clearProcessingFeeBpsCache()
    await logAdminAction(auth.ctx.userId, "processing_fee_override.delete", subjectId, {
      subject_type: subjectType,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete processing fee override" },
      { status: 500 },
    )
  }
}
