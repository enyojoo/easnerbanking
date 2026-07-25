import { NextResponse } from "next/server"
import { requireBusinessOrgWithRole } from "@/lib/b2b/require-role"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { isPayrollV2Enabled } from "@/lib/payroll/feature"

export type PayrollAccessRole = "viewer" | "preparer" | "approver"

type PayrollAccessContext =
  | {
      ok: true
      userId: string
      businessId: string
      businessRole: "Owner" | "Admin" | "Member" | "Viewer"
      payrollRole: PayrollAccessRole
    }
  | { ok: false; response: NextResponse }

export async function requirePayrollAccess(
  request: Request,
  allowed: PayrollAccessRole[],
): Promise<PayrollAccessContext> {
  const business = await requireBusinessOrgWithRole(request)
  if (!business.ok) return business

  let payrollRole: PayrollAccessRole | null =
    business.role === "Owner" || business.role === "Admin"
      ? "approver"
      : business.role === "Viewer"
        ? "viewer"
        : null

  if (!payrollRole) {
    const { data: assignment } = await createSupabaseAdmin()
      .from("payroll_access_assignments")
      .select("role")
      .eq("business_id", business.businessId)
      .eq("user_id", business.userId)
      .maybeSingle()
    const assigned = String(assignment?.role ?? "")
    if (assigned === "viewer" || assigned === "preparer" || assigned === "approver") {
      payrollRole = assigned
    }
  }

  if (!payrollRole || !allowed.includes(payrollRole)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You do not have permission to perform this payroll action." },
        { status: 403 },
      ),
    }
  }

  // Read access preserves V1 history while V2 mutations remain behind payroll_v2.
  if (!allowed.includes("viewer")) {
    const enabled = await isPayrollV2Enabled(createSupabaseAdmin(), business.businessId)
    if (!enabled) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Payroll V2 is not enabled for this business.", feature: "payroll_v2" },
          { status: 403 },
        ),
      }
    }
  }

  return {
    ok: true,
    userId: business.userId,
    businessId: business.businessId,
    businessRole: business.role,
    payrollRole,
  }
}
