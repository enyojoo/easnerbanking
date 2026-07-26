type BusinessRole = "Owner" | "Admin" | "Member" | "Viewer"

export function requiresDifferentPayrollApprover(input: {
  requireSeparateApprover: boolean
  businessRole: BusinessRole
  submittedBy: string | null | undefined
  approverUserId: string
}): boolean {
  if (!input.requireSeparateApprover) return false
  if (input.businessRole === "Owner" || input.businessRole === "Admin") return false
  return Boolean(input.submittedBy && input.submittedBy === input.approverUserId)
}

export function canSelfApprovePayroll(input: {
  requireSeparateApprover: boolean
  businessRole: BusinessRole
}): boolean {
  return (
    !input.requireSeparateApprover ||
    input.businessRole === "Owner" ||
    input.businessRole === "Admin"
  )
}
