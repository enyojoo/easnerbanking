import { NextResponse } from "next/server"
import { requirePayrollAccess } from "@/lib/payroll/require-payroll-access"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import type { PayrollCapabilities } from "@/lib/payroll/types"
import { canSelfApprovePayroll } from "@/lib/payroll/approval-policy"

export async function GET(request: Request) {
  const ctx = await requirePayrollAccess(request, ["viewer", "preparer", "approver"])
  if (!ctx.ok) return ctx.response

  const { data: settings } = await createSupabaseAdmin()
    .from("payroll_settings")
    .select("require_separate_approver")
    .eq("business_id", ctx.businessId)
    .maybeSingle()
  const role = ctx.payrollRole
  const requireSeparateApprover = Boolean(settings?.require_separate_approver)
  const capabilities: PayrollCapabilities = {
    canView: true,
    canPrepare: role === "preparer" || role === "approver",
    canApprove: role === "approver",
    canSelfApprove: canSelfApprovePayroll({
      requireSeparateApprover,
      businessRole: ctx.businessRole,
    }),
    requireSeparateApprover,
  }
  return NextResponse.json({ capabilities }, {
    headers: { "Cache-Control": "private, no-store" },
  })
}
