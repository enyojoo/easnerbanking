import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolvePayrollSourceDefaults } from "@/lib/payroll/source-account"
import {
  isPayrollPaydayTime,
  payrollTimingPreview,
} from "@/lib/payroll/schedule-preview"

export async function POST(request: Request) {
  const ctx = await requirePayrollAccess(request, ["viewer", "preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => ({}))) as {
    payday?: string
    localTime?: string
    timezone?: string
  }
  const payday = String(body.payday || "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payday)) {
    return NextResponse.json({ error: "Choose a valid payday." }, { status: 400 })
  }

  const defaults = await resolvePayrollSourceDefaults(
    createSupabaseAdmin(),
    ctx.businessId,
  )
  const localTime = String(body.localTime || defaults.paydayTime)
  const timezone = String(body.timezone || defaults.timezone)
  if (!isPayrollPaydayTime(localTime)) {
    return NextResponse.json(
      { error: "Choose a Payroll payday time in a 30-minute interval." },
      { status: 400 },
    )
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format()
  } catch {
    return NextResponse.json({ error: "Choose a valid business timezone." }, { status: 400 })
  }

  const timing = payrollTimingPreview({ payday, localTime, timezone })
  if (!timing) {
    return NextResponse.json(
      { error: "The Payroll timing could not be calculated." },
      { status: 400 },
    )
  }
  return NextResponse.json(
    { timing },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}
