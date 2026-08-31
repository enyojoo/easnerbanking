// Email notification types and interfaces

import type { EmailAudience } from "./email-audience"

export interface EmailTemplate {
  subject: string | ((data: any, audience?: EmailAudience) => string)
  preheader?: string | ((data: any, audience?: EmailAudience) => string)
  html: (data: any, audience?: EmailAudience) => string
  text: (data: any, audience?: EmailAudience) => string
}

export type EmailAttachment = {
  content: string
  filename: string
  type: string
  disposition?: "attachment" | "inline"
}

export interface EmailData {
  to: string
  template: string
  data: any
  audience?: EmailAudience
  attachments?: EmailAttachment[]
}

export interface TransactionEmailData {
  transactionId: string
  easnerTransactionId?: string
  title: string
  /** SendGrid subject – may differ from pushTitle on failed/reversed */
  emailSubject?: string
  body: string
  amountDisplay: string
  counterpartyLabel?: string
  counterpartyName?: string
  direction?: "in" | "out"
  provider?: string
  paymentRail?: string
  category?: string
  status: string
  outcome?: "success" | "failed" | "reversed"
  failureReason?: string
  detailUrl?: string
  createdAt?: string
  /** Recipient first name for "Hey {firstName}," greeting in transaction emails. */
  firstName?: string
  /**
   * Canonical detail rows (Sent amount / Processing fee / Total debited / Recipient / Transfer method
   * for payouts; Deposit method / Sender / Processing fee / Amount credited for deposits). Built at dispatch
   * time via `buildTransactionEmailDetailRows`. When present, replaces the legacy generic rows.
   */
  detailRows?: { label: string; value: string }[]
  audience?: EmailAudience
  /** When true, email includes Lightspark money-transmission receipt disclosures. */
  isGridMoneyTransmissionReceipt?: boolean
  gridTransactionId?: string
  /** Cross-border foreign remittance shortfall disclosure. */
  includeForeignRemittanceDisclosure?: boolean
}

export interface WelcomeEmailData {
  firstName: string
  lastName?: string
  email: string
  baseCurrency?: string
  dashboardUrl: string
  audience?: EmailAudience
}

export interface VerificationEmailData {
  firstName?: string
  email: string
  status: "submitted" | "approved" | "rejected" | "action_needed"
  /** Org display name – KYB merchant emails use org-centric copy when set. */
  businessName?: string
  rejectionReasons?: string[]
  dashboardUrl?: string
  audience?: EmailAudience
}

/** Internal KYB lifecycle alert for Easner compliance / ops. */
export interface KybOpsEmailData {
  businessId: string
  businessName: string
  status: VerificationEmailData["status"]
  rejectionReasons?: string[]
  officeUrl?: string
}

/** Internal personal KYC lifecycle alert for Easner compliance / ops. */
export interface KycOpsEmailData {
  userId: string
  userEmail: string
  userDisplayName?: string
  status: VerificationEmailData["status"]
  rejectionReasons?: string[]
  officeUrl?: string
}

/** Business online payments (invoice card payments) lifecycle emails. */
export interface OnlinePaymentsEmailData {
  firstName?: string
  email: string
  status: "setup_started" | "action_required" | "ready"
  /** Optional one-line summary (e.g. action-required reason). */
  summary?: string
  dashboardUrl?: string
  verificationUrl?: string
  audience?: EmailAudience
}

export interface TeamInviteEmailData {
  inviteeEmail: string
  inviterName: string
  businessName: string
  role: string
  acceptUrl: string
  /** When false, footer uses pre-account copy (invitee not in `public.users` yet). */
  recipientHasEasnerAccount?: boolean
}

export interface TeamMemberJoinedEmailData {
  recipientFirstName?: string
  businessName: string
  memberName: string
  memberEmail: string
  role: string
  settingsTeamUrl: string
}

export interface PayrollEasetagInviteEmailData {
  recipientName: string
  businessName: string
  signupUrl: string
}

export interface PayrollPaidEmailData {
  recipientName: string
  businessName: string
  amountDisplay: string
}

export interface PayrollRunSummaryEmailData {
  businessName: string
  runName: string
  completed: number
  failed: number
  total: number
  runUrl: string
}

export interface PayrollFundingNeededEmailData {
  businessName: string
  runName: string
  paydayDisplay: string
  requiredDisplay: string
  availableDisplay: string
  shortfallDisplay: string
  runUrl: string
}

export interface SecurityAlertEmailData {
  email: string
  firstName?: string
  alertType: "password_changed" | "password_reset_completed" | "mfa_enabled" | "mfa_disabled" | "new_device"
  deviceLabel?: string
  occurredAt?: string
  audience?: EmailAudience
}

/** easner.com “Get the app” popup – download link email to a non-account visitor. */
export interface AppDownloadLinkEmailData {
  email: string
  appStoreUrl?: string
  playStoreUrl?: string
  downloadPageUrl?: string
  appWebUrl?: string
}

export interface AccountStatementEmailData {
  firstName?: string
  statementId: string
  periodLabel: string
  /** Calendar end of the requested period, e.g. `29 Aug 2026`. */
  periodToLabel: string
  currency: string
  availableLabel: string
}

/** @deprecated Legacy remittance shape – use TransactionEmailData from ledger descriptor */
export interface LegacyTransactionEmailData {
  transactionId: string
  recipientName: string
  sendAmount: number
  sendCurrency: string
  receiveAmount: number
  receiveCurrency: string
  exchangeRate: number
  fee: number
  status: "pending" | "processing" | "completed" | "failed" | "cancelled"
  failureReason?: string
  createdAt: string
  updatedAt: string
}

export interface EmailServiceConfig {
  fromEmail: string
  fromName: string
  replyTo?: string
}

export interface SendGridResponse {
  success: boolean
  messageId?: string
  error?: string
  skipped?: boolean
  skipReason?: string
}
