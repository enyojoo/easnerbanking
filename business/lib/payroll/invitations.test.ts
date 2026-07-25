import { describe, expect, it } from "vitest"
import {
  createPayrollInvitationToken,
  hashPayrollInvitationToken,
  payrollApprovalUrl,
} from "./invitations"

describe("payroll invitations", () => {
  it("creates opaque hashed seven-day tokens", () => {
    const start = new Date("2026-01-01T00:00:00.000Z")
    const invitation = createPayrollInvitationToken(start)
    expect(invitation.token).not.toContain("=")
    expect(invitation.tokenHash).toBe(hashPayrollInvitationToken(invitation.token))
    expect(invitation.expiresAt).toBe("2026-01-08T00:00:00.000Z")
  })

  it("uses the canonical personal app URL", () => {
    expect(payrollApprovalUrl("opaque")).toBe("https://app.easner.com/payroll?token=opaque")
  })
})
