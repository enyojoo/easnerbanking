import type {
  OnlinePaymentsEmailData,
  PayrollFundingNeededEmailData,
  PayrollRunSummaryEmailData,
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
  body: "$99.95 credited to your USD Balance",
  firstName: "Sam",
  amountDisplay: "$100.00",
  counterpartyLabel: "From",
  counterpartyName: "Chase",
  category: "Bank Deposit",
  paymentRail: "ACH",
  status: "settled",
  createdAt: "2026-01-15T12:00:00.000Z",
  outcome: "success",
  detailRows: [
    { label: "Scheme", value: "ACH" },
    { label: "Sender", value: "Chase" },
    { label: "Processing fee", value: "-$0.05" },
    { label: "Amount credited", value: "+$99.95" },
  ],
  audience: "personal",
}

export const txFailedFixture: TransactionEmailData = {
  ...txSettledFixture,
  title: "Payout",
  body: "Your payout of $100.00 could not be completed.",
  firstName: "Sam",
  category: "Local transfer",
  outcome: "failed",
  status: "failed",
  failureReason: "Recipient bank rejected the transfer.",
  detailRows: [
    { label: "Sent amount", value: "$100.00" },
    { label: "Processing fee", value: "-$1.40" },
    { label: "Exchange rate", value: "1 USD = 1,584 NGN" },
    { label: "Total debited", value: "-$101.40" },
    { label: "Recipient amount", value: "₦159,200" },
    { label: "Recipient", value: "Samuel Odiba (Kuda • 1234567890)" },
    { label: "Transfer method", value: "Local transfer" },
  ],
}

export const txReversedFixture: TransactionEmailData = {
  ...txSettledFixture,
  title: "Easetag transfer",
  body: "Your transfer was reversed and funds were restored.",
  category: "Easetag Send",
  outcome: "reversed",
  status: "reversed",
  detailRows: [
    { label: "Sent amount", value: "$25.00" },
    { label: "Total debited", value: "-$25.00" },
    { label: "Recipient amount", value: "$25.00" },
    { label: "Recipient", value: "@jordan" },
    { label: "Transfer method", value: "Easetag (wallet-to-wallet)" },
  ],
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
  dashboardUrl: "https://app.easner.com/user/dashboard",
  audience: "personal",
}

export const kybApprovedFixture: VerificationEmailData = {
  firstName: "Alex",
  email: "alex@example.com",
  status: "approved",
  dashboardUrl: "https://business.easner.com/dashboard",
  audience: "business",
}

export const onlinePaymentsReadyFixture: OnlinePaymentsEmailData = {
  firstName: "Alex",
  email: "alex@example.com",
  status: "ready",
  dashboardUrl: "https://business.easner.com",
  verificationUrl: "https://business.easner.com/settings?tab=verification",
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
  acceptUrl: "https://business.easner.com/auth/join/mem_abc123",
  recipientHasEasnerAccount: false,
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

export const payrollRunSummaryFixture: PayrollRunSummaryEmailData = {
  businessName: "Acme LLC",
  runName: "July payroll",
  completed: 8,
  failed: 1,
  total: 9,
  runUrl: "https://business.easner.com/payroll/runs/run-123",
}

export const payrollFundingNeededFixture: PayrollFundingNeededEmailData = {
  businessName: "Acme LLC",
  runName: "July payroll",
  paydayDisplay: "July 31, 2026",
  requiredDisplay: "USD 10,000.00",
  availableDisplay: "USD 7,500.00",
  shortfallDisplay: "USD 2,500.00",
  runUrl: "https://business.easner.com/payroll/runs/run-123",
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
  onlinePaymentsSetupStarted: {
    ...onlinePaymentsReadyFixture,
    status: "setup_started" as const,
  },
  onlinePaymentsActionRequired: {
    ...onlinePaymentsReadyFixture,
    status: "action_required" as const,
    summary: "Additional business details are required.",
  },
  onlinePaymentsReady: onlinePaymentsReadyFixture,
  teamInvitation: teamInviteFixture,
  payrollRunSummary: payrollRunSummaryFixture,
  payrollFundingNeeded: payrollFundingNeededFixture,
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
  onlinePaymentsSetupStarted: "business",
  onlinePaymentsActionRequired: "business",
  onlinePaymentsReady: "business",
  teamInvitation: "business",
}
