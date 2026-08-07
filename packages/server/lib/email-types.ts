// Email notification types and interfaces

import type { EmailAudience } from "./email-audience"

export interface EmailTemplate {
  subject: string | ((data: any, audience?: EmailAudience) => string)
  preheader?: string | ((data: any, audience?: EmailAudience) => string)
  html: (data: any, audience?: EmailAudience) => string
  text: (data: any, audience?: EmailAudience) => string
}

export interface EmailData {
  to: string
  template: string
  data: any
  audience?: EmailAudience
}

export interface TransactionEmailData {
  transactionId: string
  easnerTransactionId?: string
  title: string
  /** SendGrid subject — may differ from pushTitle on failed/reversed */
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
  status: "submitted" | "approved" | "rejected"
  rejectionReasons?: string[]
  dashboardUrl?: string
  audience?: EmailAudience
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

/** easner.com “Get the app” popup — download link email to a non-account visitor. */
export interface AppDownloadLinkEmailData {
  email: string
  appStoreUrl?: string
  playStoreUrl?: string
  downloadPageUrl?: string
  appWebUrl?: string
}

/** @deprecated Legacy remittance shape — use TransactionEmailData from ledger descriptor */
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
