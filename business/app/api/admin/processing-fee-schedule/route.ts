import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import {
  listProcessingFeeScheduleAdmin,
  upsertProcessingFeeScheduleAdmin,
  type ProcessingFeeScheduleScope,
} from "@/lib/admin/processing-fee-schedule-service"
import { clearProcessingFeeBpsCache } from "@/lib/processing-fee/resolve-processing-fee-bps"

export const runtime = "nodejs"

const SCOPES = new Set<ProcessingFeeScheduleScope>(["fiat_bank", "fiat_mobile_money", "crypto"])

function parseScope(raw: string | null): ProcessingFeeScheduleScope | null {
  const v = String(raw ?? "").trim() as ProcessingFeeScheduleScope
  return SCOPES.has(v) ? v : null
}

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const scope = parseScope(new URL(request.url).searchParams.get("scope"))
  if (!scope) {
    return NextResponse.json({ error: "scope required (fiat_bank|fiat_mobile_money|crypto)" }, { status: 400 })
  }

  try {
    const admin = createSupabaseAdmin()
    const fees = await listProcessingFeeScheduleAdmin(admin, scope)
    return NextResponse.json({ fees })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load processing fee schedule" },
      { status: 500 },
    )
  }
}

export async function PUT(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as { fees?: unknown } | null
  const rows = Array.isArray(body?.fees) ? body.fees : null
  if (!rows?.length) return NextResponse.json({ error: "fees array required" }, { status: 400 })

  try {
    const admin = createSupabaseAdmin()
    await upsertProcessingFeeScheduleAdmin(
      admin,
      rows.map((row) => {
        const r = row as Record<string, unknown>
        const scope = parseScope(String(r.scope ?? ""))
        if (!scope) throw new Error("Invalid scope on fee row")
        return {
          scope,
          country_code: r.country_code == null ? null : String(r.country_code),
          currency_code: r.currency_code == null ? null : String(r.currency_code),
          asset_code: r.asset_code == null ? null : String(r.asset_code),
          pay_in_bps: Number(r.pay_in_bps),
          pay_out_bps: Number(r.pay_out_bps),
          cross_border_bps: Number(r.cross_border_bps),
        }
      }),
      auth.ctx.userId,
    )
    clearProcessingFeeBpsCache()
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid processing fee schedule payload" },
      { status: 400 },
    )
  }
}
