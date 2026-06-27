// Email templates — design-system aligned, Business vs Personal variants

import {
  generateBaseEmailTemplate,
  generateTransactionDetailsTable,
  type TransactionDetailRow,
} from "./email-generator"
import { getEmailAudienceProfile, type EmailAudience } from "./email-audience"
import type {
  EmailTemplate,
  SecurityAlertEmailData,
  TeamInviteEmailData,
  TransactionEmailData,
  VerificationEmailData,
  WelcomeEmailData,
} from "./email-types"

const CONTACT_URL = "https://easner.com/contact"

function txDetailUrl(data: TransactionEmailData, audience: EmailAudience): string {
  if (data.detailUrl) return data.detailUrl
  const base =
    audience === "business"
      ? process.env.NEXT_PUBLIC_BUSINESS_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "https://business.easner.com"
      : process.env.NEXT_PUBLIC_APP_URL || "https://www.easner.com"
  const id = data.easnerTransactionId || data.transactionId
  return `${base}/transactions/${encodeURIComponent(id)}`
}

function buildTransactionDetailRows(data: TransactionEmailData): TransactionDetailRow[] {
  const rows: TransactionDetailRow[] = [
    {
      label: "Transaction ID",
      value: data.easnerTransactionId || data.transactionId,
    },
    { label: "Type", value: data.category || data.title },
    { label: "Amount", value: data.amountDisplay },
  ]
  if (data.counterpartyName && data.counterpartyLabel) {
    rows.push({ label: data.counterpartyLabel, value: data.counterpartyName })
  }
  if (data.paymentRail) rows.push({ label: "Payment method", value: data.paymentRail })
  const displayStatus = data.status === "settled" ? "completed" : data.status
  rows.push({
    label: "Status",
    value: displayStatus,
    isStatus: true,
    statusClass: data.status === "settled" ? "completed" : displayStatus,
  })
  if (data.createdAt) {
    rows.push({ label: "Date", value: new Date(data.createdAt).toLocaleDateString() })
  }
  return rows
}

function transactionSettledTemplate(): EmailTemplate {
  return {
    subject: (data: TransactionEmailData) => data.title,
    preheader: (data: TransactionEmailData) => data.body,
    html: (data: TransactionEmailData, audience = "personal") => {
      const content = `
        <p class="confirmation-text">${data.body}</p>
        ${generateTransactionDetailsTable(buildTransactionDetailRows(data))}
      `
      return generateBaseEmailTemplate(data.title, "", content, {
        text: "View transaction",
        url: txDetailUrl(data, audience),
      }, { audience, preheader: data.body, showPreferencesLink: false })
    },
    text: (data: TransactionEmailData, audience = "personal") =>
      `${data.title}\n\n${data.body}\n\nView transaction: ${txDetailUrl(data, audience)}`,
  }
}

function transactionFailedTemplate(): EmailTemplate {
  return {
    subject: (data: TransactionEmailData) => `${data.title} — not completed`,
    preheader: (data: TransactionEmailData) => data.body,
    html: (data: TransactionEmailData, audience = "personal") => {
      const reason = data.failureReason
        ? `<p class="confirmation-text"><strong>Reason:</strong> ${data.failureReason}</p>`
        : ""
      const content = `
        <p class="confirmation-text">${data.body}</p>
        ${reason}
        ${generateTransactionDetailsTable(buildTransactionDetailRows(data))}
        <div class="security-note"><h3>What happens next</h3><p>If funds were debited, we will restore your balance where applicable. Contact support if you need help.</p></div>
      `
      const profile = getEmailAudienceProfile(audience)
      return generateBaseEmailTemplate(data.title, "", content, {
        text: "Contact support",
        url: `mailto:${profile.supportEmail}`,
      }, { audience, preheader: data.body, showPreferencesLink: false })
    },
    text: (data: TransactionEmailData, audience = "personal") => {
      const profile = getEmailAudienceProfile(audience)
      return `${data.title}\n\n${data.body}${data.failureReason ? `\nReason: ${data.failureReason}` : ""}\n\nContact: ${profile.supportEmail}`
    },
  }
}

function transactionReversedTemplate(): EmailTemplate {
  return {
    subject: (data: TransactionEmailData) => `${data.title} — reversed`,
    html: (data: TransactionEmailData, audience = "personal") => {
      const content = `
        <p class="confirmation-text">${data.body}</p>
        ${generateTransactionDetailsTable(buildTransactionDetailRows(data))}
      `
      return generateBaseEmailTemplate(data.title, "", content, {
        text: "View transaction",
        url: txDetailUrl(data, audience),
      }, { audience, showPreferencesLink: false })
    },
    text: (data: TransactionEmailData, audience = "personal") =>
      `${data.title}\n\n${data.body}\n\nView: ${txDetailUrl(data, audience)}`,
  }
}

export const emailTemplates: Record<string, EmailTemplate> = {
  welcomeBusiness: {
    subject: "Welcome to Easner Business Banking",
    preheader: "Complete KYB, fund your account, and explore global payouts and collections.",
    html: (data: WelcomeEmailData) => {
      const profile = getEmailAudienceProfile("business")
      const content = `
        <p class="welcome-text">Dear ${data.firstName},</p>
        <p class="confirmation-text">
          Congratulations on creating your Easner Business account. We're excited to have you with us as you start managing multi-currency accounts, global payouts, collections, and more — all in one dashboard.
        </p>
        <div class="security-note">
          <h3>Quick next steps</h3>
          <p>
            <strong>Complete your KYB verification</strong> — Log in at business.easner.com and finish business verification. This usually takes just a few minutes and unlocks full access where supported.<br><br>
            <strong>Fund your account</strong> — Add funds via USD or EUR bank accounts or stablecoin to start sending payouts or collecting payments where enabled.<br><br>
            <strong>Explore the platform</strong> — Multi-currency balances, global payouts, invoicing, QR Pay, team controls, and reporting.
          </p>
        </div>
        <p class="confirmation-text">
          <strong>Want a personalized walkthrough?</strong> We offer free 15–20 minute onboarding calls. We can walk you through the dashboard, help with KYB questions, and show you the fastest ways to send payouts or set up collections.
        </p>
        <p class="confirmation-text">
          Book a call at <a href="${CONTACT_URL}" style="color: #007ACC;">easner.com/contact</a> or reply to this email with your preferred time.
        </p>
        <p class="confirmation-text">
          If you prefer to explore on your own first, our in-app chat and support team are always available. Fees and FX may apply; shown before you confirm.
        </p>
        ${profile.signatureHtml ?? ""}
      `
      return generateBaseEmailTemplate(
        "Welcome to Easner Business",
        profile.productName,
        content,
        { text: "Go to dashboard", url: data.dashboardUrl || profile.dashboardUrl },
        { audience: "business", preheader: "Complete KYB and explore your dashboard.", showPreferencesLink: true },
      )
    },
    text: (data: WelcomeEmailData) => {
      const profile = getEmailAudienceProfile("business")
      return `Welcome to Easner Business Banking

Dear ${data.firstName},

Congratulations on creating your Easner Business account.

Quick next steps:
- Complete KYB at business.easner.com
- Fund your account (bank or stablecoin where enabled)
- Explore payouts, collections, invoicing, and team controls

Book an onboarding call: ${CONTACT_URL}

Dashboard: ${data.dashboardUrl || profile.dashboardUrl}
${profile.signatureText ?? ""}`
    },
  },

  welcomePersonal: {
    subject: "Welcome to Easner Personal Banking",
    preheader: "Verify your identity and start moving money with banking-simple screens.",
    html: (data: WelcomeEmailData) => {
      const profile = getEmailAudienceProfile("personal")
      const content = `
        <p class="welcome-text">Hi ${data.firstName},</p>
        <p class="confirmation-text">
          Welcome to Easner Mobile — your Easner Personal Banking account is ready. Send, receive, and track money in screens that feel like banking, not crypto complexity.
        </p>
        <div class="security-note">
          <h3>Get started</h3>
          <p>
            Complete identity verification in the app to unlock accounts and transfers where supported.<br>
            Add funds via bank deposit or stablecoin where enabled.<br>
            Save recipients and track activity in real time.
          </p>
        </div>
        <p class="confirmation-text">
          Fees and FX may apply and are shown before you confirm. Availability depends on verification, jurisdiction, and partner enablement.
        </p>
      `
      return generateBaseEmailTemplate(
        "Welcome to Easner",
        profile.productName,
        content,
        { text: "Open the app", url: data.dashboardUrl || profile.dashboardUrl },
        { audience: "personal", preheader: "Verify and start using Easner Mobile.", showPreferencesLink: true },
      )
    },
    text: (data: WelcomeEmailData) => {
      const profile = getEmailAudienceProfile("personal")
      return `Welcome to Easner Personal Banking

Hi ${data.firstName},

Your Easner Mobile account is ready. Complete verification in the app, then send and receive where supported.

Fees and FX may apply; shown before you confirm.

${data.dashboardUrl || profile.dashboardUrl}`
    },
  },

  transactionSettled: transactionSettledTemplate(),
  transactionFailed: transactionFailedTemplate(),
  transactionReversed: transactionReversedTemplate(),

  kybSubmitted: verificationTemplate("KYB", "business", "submitted"),
  kybApproved: verificationTemplate("KYB", "business", "approved"),
  kybRejected: verificationTemplate("KYB", "business", "rejected"),
  kycSubmitted: verificationTemplate("KYC", "personal", "submitted"),
  kycApproved: verificationTemplate("KYC", "personal", "approved"),
  kycRejected: verificationTemplate("KYC", "personal", "rejected"),

  teamInvitation: {
    subject: (data: TeamInviteEmailData) => `You're invited to ${data.businessName} on Easner`,
    html: (data: TeamInviteEmailData) => {
      const content = `
        <p class="confirmation-text">
          ${data.inviterName} invited you to join <strong>${data.businessName}</strong> on Easner Business as <strong>${data.role}</strong>.
        </p>
        <p class="confirmation-text">Accept the invitation to access the business dashboard.</p>
      `
      return generateBaseEmailTemplate(
        "Team invitation",
        data.businessName,
        content,
        { text: "Accept invitation", url: data.acceptUrl },
        { audience: "business", showPreferencesLink: false },
      )
    },
    text: (data: TeamInviteEmailData) =>
      `${data.inviterName} invited you to ${data.businessName} as ${data.role}.\n\nAccept: ${data.acceptUrl}`,
  },

  passwordChanged: securityTemplate("password_changed"),
  passwordResetCompleted: securityTemplate("password_reset_completed"),
  mfaEnabled: securityTemplate("mfa_enabled"),
  mfaDisabled: securityTemplate("mfa_disabled"),
  newDeviceLogin: securityTemplate("new_device"),

  adminTransactionNotification: {
    subject: (data: { status?: string; transactionId?: string }) =>
      `New transfer ${data.status === "pending" ? "created" : "updated"} — #${data.transactionId}`,
    html: (data: { status?: string; userName?: string }) => {
      const userName =
        data.userName && data.userName !== "User" && data.userName !== "Unknown"
          ? data.userName
          : "a user"
      const content = `<p class="confirmation-text">${
        data.status === "pending"
          ? `A new transaction was created by ${userName}.`
          : `A transaction was updated to ${data.status}.`
      }</p>`
      const adminUrl = process.env.NEXT_PUBLIC_OFFICE_URL || "https://bk.easner.com"
      return generateBaseEmailTemplate("Admin alert", "", content, {
        text: "View in admin",
        url: `${adminUrl}/transactions`,
      }, { showPreferencesLink: false })
    },
    text: (data: { status?: string; transactionId?: string }) => {
      const adminUrl = process.env.NEXT_PUBLIC_OFFICE_URL || "https://bk.easner.com"
      return `Transaction ${data.transactionId} — ${data.status}\n${adminUrl}/transactions`
    },
  },
}

function verificationTemplate(
  kind: "KYB" | "KYC",
  audience: EmailAudience,
  status: VerificationEmailData["status"],
): EmailTemplate {
  const titles = {
    submitted: `${kind} verification submitted`,
    approved: `${kind} verification approved`,
    rejected: `${kind} verification update`,
  }
  const bodies = {
    submitted: `We've received your ${kind} verification. We'll email you when there is an update.`,
    approved: `Your ${kind} verification is approved. You can now access features where enabled for your profile.`,
    rejected: `Your ${kind} verification could not be approved at this time.`,
  }
  return {
    subject: () => titles[status],
    html: (data: VerificationEmailData) => {
      const reasons =
        status === "rejected" && data.rejectionReasons?.length
          ? `<p class="confirmation-text"><strong>Details:</strong> ${data.rejectionReasons.join("; ")}</p>`
          : ""
      const profile = getEmailAudienceProfile(audience)
      const content = `
        <p class="welcome-text">${data.firstName ? `Hi ${data.firstName},` : "Hello,"}</p>
        <p class="confirmation-text">${bodies[status]}</p>
        ${reasons}
      `
      return generateBaseEmailTemplate(
        titles[status],
        profile.productName,
        content,
        status === "approved"
          ? { text: "Go to dashboard", url: data.dashboardUrl || profile.dashboardUrl }
          : undefined,
        { audience, showPreferencesLink: false },
      )
    },
    text: (data: VerificationEmailData) => {
      const profile = getEmailAudienceProfile(audience)
      let t = `${titles[status]}\n\n${bodies[status]}`
      if (status === "rejected" && data.rejectionReasons?.length) {
        t += `\n\nDetails: ${data.rejectionReasons.join("; ")}`
      }
      if (status === "approved") t += `\n\n${data.dashboardUrl || profile.dashboardUrl}`
      return t
    },
  }
}

function securityTemplate(alertType: SecurityAlertEmailData["alertType"]): EmailTemplate {
  const copy: Record<SecurityAlertEmailData["alertType"], { subject: string; body: string }> = {
    password_changed: {
      subject: "Your Easner password was changed",
      body: "Your account password was just changed. If you did not make this change, contact support immediately.",
    },
    password_reset_completed: {
      subject: "Your Easner password was reset",
      body: "Your account password was reset successfully. If you did not request this, contact support immediately.",
    },
    mfa_enabled: {
      subject: "Two-factor authentication enabled",
      body: "Two-factor authentication was enabled on your Easner account.",
    },
    mfa_disabled: {
      subject: "Two-factor authentication disabled",
      body: "Two-factor authentication was disabled on your Easner account. If you did not make this change, contact support immediately.",
    },
    new_device: {
      subject: "New device registered on your Easner account",
      body: "A new device was registered to receive notifications on your account.",
    },
  }
  const c = copy[alertType]
  return {
    subject: () => c.subject,
    html: (data: SecurityAlertEmailData, audience = "personal") => {
      const device =
        data.deviceLabel && alertType === "new_device"
          ? `<p class="confirmation-text">Device: ${data.deviceLabel}</p>`
          : ""
      const content = `
        <p class="confirmation-text">${c.body}</p>
        ${device}
      `
      const profile = getEmailAudienceProfile(audience)
      return generateBaseEmailTemplate(c.subject, "", content, {
        text: "Contact support",
        url: `mailto:${profile.supportEmail}`,
      }, { audience, showPreferencesLink: false })
    },
    text: (data: SecurityAlertEmailData) =>
      `${c.subject}\n\n${c.body}${data.deviceLabel ? `\nDevice: ${data.deviceLabel}` : ""}`,
  }
}
