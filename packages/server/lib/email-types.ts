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

export interface TeamInviteEmailData {
  inviteeEmail: string
  inviterName: string
  businessName: string
  role: string
  acceptUrl: string
  /** When false, footer uses pre-account copy (invitee not in `public.users` yet). */
  recipientHasEasnerAccount?: boolean
}

export interface SecurityAlertEmailData {
  email: string
  firstName?: string
  alertType: "password_changed" | "password_reset_completed" | "mfa_enabled" | "mfa_disabled" | "new_device"
  deviceLabel?: string
  occurredAt?: string
  audience?: EmailAudience
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
