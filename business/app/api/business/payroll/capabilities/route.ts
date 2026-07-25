import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import type { PayrollCapabilities } from "@/lib/payroll/types"
import { isPayrollV2Enabled } from "@/lib/payroll/feature"

export async function GET(request: Request) {
  const ctx = await requirePayrollAccess(request, ["viewer", "preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const { data: settings } = await createSupabaseAdmin()
    .from("payroll_settings")
    .select("enabled,require_separate_approver")
    .eq("business_id", ctx.businessId)
    .maybeSingle()
  const role = ctx.payrollRole
  const enabled = await isPayrollV2Enabled(createSupabaseAdmin(), ctx.businessId)
  const capabilities: PayrollCapabilities = {
    feature: "payroll_v2",
    enabled,
    canView: true,
    canPrepare: role === "preparer" || role === "approver",
    canApprove: role === "approver",
    requireSeparateApprover: Boolean(settings?.require_separate_approver),
  }
  return NextResponse.json({ capabilities }, {
    headers: { "Cache-Control": "private, no-store" },
  })
}
