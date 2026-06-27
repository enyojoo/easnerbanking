import type {
  SecurityAlertEmailData,
  TeamInviteEmailData,
  TransactionEmailData,
  VerificationEmailData,
  WelcomeEmailData,
} from "./email-types"

export const txSettledFixture: TransactionEmailData = {
  transactionId: "tx-uuid-1",
  easnerTransactionId: "ET-1001",
  title: "Bank Deposit",
  body: "Funds are now available in your account balance.",
  amountDisplay: "$100.00",
  counterpartyLabel: "From",
  counterpartyName: "Chase",
  category: "Bank Deposit",
  paymentRail: "ACH",
  status: "settled",
  outcome: "success",
  audience: "personal",
}

export const txFailedFixture: TransactionEmailData = {
  ...txSettledFixture,
  title: "Payout",
  body: "Your payout could not be completed.",
  outcome: "failed",
  status: "failed",
  failureReason: "Recipient bank rejected the transfer.",
}

export const txReversedFixture: TransactionEmailData = {
  ...txSettledFixture,
  title: "Easetag transfer",
  body: "Your transfer was reversed and funds were restored.",
  outcome: "reversed",
  status: "reversed",
}

export const welcomeBusinessFixture: WelcomeEmailData = {
  firstName: "Alex",
  email: "alex@example.com",
  dashboardUrl: "https://business.easner.com/dashboard",
  audience: "business",
}

export const welcomePersonalFixture: WelcomeEmailData = {
  firstName: "Sam",
  email: "sam@example.com",
  dashboardUrl: "https://www.easner.com/dashboard",
  audience: "personal",
}

export const kybApprovedFixture: VerificationEmailData = {
  firstName: "Alex",
  email: "alex@example.com",
  status: "approved",
  dashboardUrl: "https://business.easner.com/dashboard",
  audience: "business",
}

export const kycRejectedFixture: VerificationEmailData = {
  firstName: "Sam",
  email: "sam@example.com",
  status: "rejected",
  rejectionReasons: ["Document unreadable"],
  audience: "personal",
}

export const teamInviteFixture: TeamInviteEmailData = {
  inviteeEmail: "new@example.com",
  inviterName: "Alex Owner",
  businessName: "Acme LLC",
  role: "Admin",
  acceptUrl: "https://business.easner.com/auth/signup?invite=1",
}

export const securityPasswordChangedFixture: SecurityAlertEmailData = {
  email: "user@example.com",
  firstName: "Sam",
  alertType: "password_changed",
  audience: "personal",
}

export const adminTxFixture = {
  transactionId: "ET-9999",
  status: "pending",
  userName: "Test User",
}

/** Template key → fixture data for render tests */
export const templateFixtures: Record<string, unknown> = {
  welcomeBusiness: welcomeBusinessFixture,
  welcomePersonal: welcomePersonalFixture,
  transactionSettled: txSettledFixture,
  transactionFailed: txFailedFixture,
  transactionReversed: txReversedFixture,
  kybSubmitted: { ...kybApprovedFixture, status: "submitted" as const },
  kybApproved: kybApprovedFixture,
  kybRejected: { ...kybApprovedFixture, status: "rejected" as const, rejectionReasons: ["Incomplete docs"] },
  kycSubmitted: { ...kycRejectedFixture, status: "submitted" as const, rejectionReasons: undefined },
  kycApproved: { ...kycRejectedFixture, status: "approved" as const, rejectionReasons: undefined },
  kycRejected: kycRejectedFixture,
  teamInvitation: teamInviteFixture,
  passwordChanged: securityPasswordChangedFixture,
  passwordResetCompleted: { ...securityPasswordChangedFixture, alertType: "password_reset_completed" as const },
  mfaEnabled: { ...securityPasswordChangedFixture, alertType: "mfa_enabled" as const },
  mfaDisabled: { ...securityPasswordChangedFixture, alertType: "mfa_disabled" as const },
  newDeviceLogin: { ...securityPasswordChangedFixture, alertType: "new_device" as const, deviceLabel: "ios" },
  adminTransactionNotification: adminTxFixture,
}

/** Default audience per template (both tested where applicable). */
export const templateDefaultAudience: Record<string, "business" | "personal"> = {
  welcomeBusiness: "business",
  welcomePersonal: "personal",
  kybSubmitted: "business",
  kybApproved: "business",
  kybRejected: "business",
  kycSubmitted: "personal",
  kycApproved: "personal",
  kycRejected: "personal",
  teamInvitation: "business",
}
