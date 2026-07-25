import { createHash, randomBytes } from "node:crypto"

export const PAYROLL_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function hashPayrollInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export function createPayrollInvitationToken(now = new Date()): {
  token: string
  tokenHash: string
  expiresAt: string
} {
  const token = randomBytes(32).toString("base64url")
  return {
    token,
    tokenHash: hashPayrollInvitationToken(token),
    expiresAt: new Date(now.getTime() + PAYROLL_INVITATION_TTL_MS).toISOString(),
  }
}

export function payrollApprovalUrl(token: string): string {
  const url = new URL("https://app.easner.com/payroll")
  url.searchParams.set("token", token)
  return url.toString()
}
