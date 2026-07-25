import { NextResponse } from "next/server"
import { requireBusinessOrgWithRole } from "@/lib/b2b/require-role"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

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

  return {
    ok: true,
    userId: business.userId,
    businessId: business.businessId,
    businessRole: business.role,
    payrollRole,
  }
}
