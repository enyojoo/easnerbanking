// Email templates – design-system aligned, Business vs Personal variants

import { personalMobileTransactionUrl } from "@easner/shared/mobile-personal-links"
import {
  easnerUserGreetingParagraphHtml,
  formatEasnerUserGreetingPlain,
} from "./email-greeting"
import {
  generateBaseEmailTemplate,
  generateTransactionDetailsTable,
  type TransactionDetailRow,
} from "./email-generator"
import { getEmailAudienceProfile, type EmailAudience } from "./email-audience"
import { EASNER_CONTACT_URL } from "./email-theme"
import type {
  EmailTemplate,
  SecurityAlertEmailData,
  TeamInviteEmailData,
  PayrollEasetagInviteEmailData,
  PayrollPaidEmailData,
  TransactionEmailData,
  VerificationEmailData,
  WelcomeEmailData,
} from "./email-types"

const WELCOME_PERSONAL_PREHEADER =
  "Verify your identity and start using Easner Mobile."

const WELCOME_BUSINESS_PREHEADER =
  "Complete KYB, fund your account, and explore global payouts and collections."

function txDetailUrl(data: TransactionEmailData, audience: EmailAudience): string {
  if (data.detailUrl) return data.detailUrl
  const id = data.easnerTransactionId || data.transactionId
  if (audience === "business") {
    const base =
      process.env.NEXT_PUBLIC_BUSINESS_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://business.easner.com"
    return `${base}/transactions/${encodeURIComponent(id)}`
  }
  return personalMobileTransactionUrl(id, process.env.NEXT_PUBLIC_MOBILE_APP_URL)
}

function buildTransactionDetailRows(data: TransactionEmailData): TransactionDetailRow[] {
  const rows: TransactionDetailRow[] = [
    {
      label: "Transaction ID",
      value: data.easnerTransactionId || data.transactionId,
    },
  ]

  if (data.detailRows?.length) {
    for (const row of data.detailRows) rows.push({ label: row.label, value: row.value })
  } else {
    rows.push({ label: "Type", value: data.category || data.title })
    rows.push({ label: "Amount", value: data.amountDisplay })
    if (data.counterpartyName && data.counterpartyLabel) {
      rows.push({ label: data.counterpartyLabel, value: data.counterpartyName })
    }
    if (data.paymentRail) rows.push({ label: "Payment method", value: data.paymentRail })
  }

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

function transactionEmailSubject(data: TransactionEmailData): string {
  return data.emailSubject?.trim() || data.title
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function transactionEmailIntroHtml(data: TransactionEmailData): string {
  return `
        ${easnerUserGreetingParagraphHtml(data.firstName)}
        <p class="confirmation-text">${escapeHtmlText(data.body)}</p>
      `
}

function transactionEmailIntroText(data: TransactionEmailData): string {
  return `${formatEasnerUserGreetingPlain(data.firstName)}\n\n${data.body}`
}

function transactionSettledTemplate(): EmailTemplate {
  return {
    subject: (data: TransactionEmailData) => transactionEmailSubject(data),
    preheader: (data: TransactionEmailData) => data.body,
    html: (data: TransactionEmailData, audience = "personal") => {
      const content = `
        ${transactionEmailIntroHtml(data)}
        ${generateTransactionDetailsTable(buildTransactionDetailRows(data))}
      `
      return generateBaseEmailTemplate(data.title, "", content, {
        text: "View transaction",
        url: txDetailUrl(data, audience),
      }, { audience, preheader: data.body, showPreferencesLink: false })
    },
    text: (data: TransactionEmailData, audience = "personal") =>
      `${data.title}\n\n${transactionEmailIntroText(data)}\n\nView transaction: ${txDetailUrl(data, audience)}`,
  }
}

function transactionFailedTemplate(): EmailTemplate {
  return {
    subject: (data: TransactionEmailData) => transactionEmailSubject(data),
    preheader: (data: TransactionEmailData) => data.body,
    html: (data: TransactionEmailData, audience = "personal") => {
      const reason = data.failureReason
        ? `<p class="confirmation-text"><strong>Reason:</strong> ${data.failureReason}</p>`
        : ""
      const content = `
        ${transactionEmailIntroHtml(data)}
        ${reason}
        ${generateTransactionDetailsTable(buildTransactionDetailRows(data))}
        <div class="security-note"><h3>What happens next</h3><p>If funds were debited, we will restore your balance where applicable. Contact support if you need help.</p></div>
      `
      return generateBaseEmailTemplate(data.title, "", content, {
        text: "Contact support",
        url: EASNER_CONTACT_URL,
      }, { audience, preheader: data.body, showPreferencesLink: false })
    },
    text: (data: TransactionEmailData, audience = "personal") => {
      return `${data.title}\n\n${transactionEmailIntroText(data)}${data.failureReason ? `\nReason: ${data.failureReason}` : ""}\n\nContact support: ${EASNER_CONTACT_URL}`
    },
  }
}

function transactionReversedTemplate(): EmailTemplate {
  return {
    subject: (data: TransactionEmailData) => transactionEmailSubject(data),
    preheader: (data: TransactionEmailData) => data.body,
    html: (data: TransactionEmailData, audience = "personal") => {
      const content = `
        ${transactionEmailIntroHtml(data)}
        ${generateTransactionDetailsTable(buildTransactionDetailRows(data))}
      `
      return generateBaseEmailTemplate(data.title, "", content, {
        text: "View transaction",
        url: txDetailUrl(data, audience),
      }, { audience, preheader: data.body, showPreferencesLink: false })
    },
    text: (data: TransactionEmailData, audience = "personal") =>
      `${data.title}\n\n${transactionEmailIntroText(data)}\n\nView: ${txDetailUrl(data, audience)}`,
  }
}

export const emailTemplates: Record<string, EmailTemplate> = {
  welcomeBusiness: {
    subject: "Welcome to Easner Business Banking",
    preheader: WELCOME_BUSINESS_PREHEADER,
    html: (data: WelcomeEmailData) => {
      const profile = getEmailAudienceProfile("business")
      const content = `
        ${easnerUserGreetingParagraphHtml(data.firstName)}
        <p class="confirmation-text">
          Congratulations on creating your Easner Business account. We're excited to have you with us as you start managing multi-currency accounts, global payouts, collections, and more – all in one dashboard.
        </p>
        <div class="security-note">
          <h3>Quick next steps</h3>
          <p>
            <strong>Complete your KYB verification</strong> – Log in at business.easner.com and finish business verification. This usually takes just a few minutes and unlocks full access where supported.<br><br>
            <strong>Fund your account</strong> – Add funds via USD or EUR bank accounts or stablecoin to start sending payouts or collecting payments where enabled.<br><br>
            <strong>Explore the platform</strong> – Multi-currency balances, global payouts, invoicing, QR Pay, team controls, and reporting.
          </p>
        </div>
        <p class="confirmation-text">
          <strong>Want a personalized walkthrough?</strong> We offer free 15–20 minute onboarding calls. We can walk you through the dashboard, help with KYB questions, and show you the fastest ways to send payouts or set up collections.
        </p>
        <p class="confirmation-text">
          Book a call at <a href="${EASNER_CONTACT_URL}" style="color: #007ACC;">easner.com/contact</a> or reply to this email with your preferred time.
        </p>
        <p class="confirmation-text">
          If you prefer to explore on your own first, our in-app chat and support team are always available. Fees and FX may apply; shown before you confirm.
        </p>
        ${profile.signatureHtml ?? ""}
      `
      return generateBaseEmailTemplate(
        "Welcome to Easner Business Banking",
        profile.productName,
        content,
        { text: "Go to dashboard", url: data.dashboardUrl || profile.dashboardUrl },
        { audience: "business", preheader: WELCOME_BUSINESS_PREHEADER, showPreferencesLink: true },
      )
    },
    text: (data: WelcomeEmailData) => {
      const profile = getEmailAudienceProfile("business")
      return `Welcome to Easner Business Banking

${formatEasnerUserGreetingPlain(data.firstName)}

Congratulations on creating your Easner Business account.

Quick next steps:
- Complete KYB at business.easner.com
- Fund your account (bank or stablecoin where enabled)
- Explore payouts, collections, invoicing, and team controls

Book an onboarding call: ${EASNER_CONTACT_URL}

Dashboard: ${data.dashboardUrl || profile.dashboardUrl}
${profile.signatureText ?? ""}`
    },
  },

  welcomePersonal: {
    subject: "Welcome to Easner Banking",
    preheader: WELCOME_PERSONAL_PREHEADER,
    html: (data: WelcomeEmailData) => {
      const profile = getEmailAudienceProfile("personal")
      const content = `
        ${easnerUserGreetingParagraphHtml(data.firstName)}
        <p class="confirmation-text">
          Congratulations on creating your Easner banking account. Send, receive, and track money in screens that feel like traditional banking, no complexity, no friction.
        </p>
        <div class="security-note">
          <h3>Get started</h3>
          <p>
            Complete identity verification in the app to unlock accounts and transfers where supported.<br><br>
            Add funds via bank deposit or stablecoin where enabled.<br><br>
            Save recipients and track activity in real time.
          </p>
        </div>
        <p class="confirmation-text">
          Fees and FX may apply and are shown before you confirm. Availability depends on verification, jurisdiction, and partner enablement.
        </p>
        ${profile.signatureHtml ?? ""}
      `
      return generateBaseEmailTemplate(
        "Welcome to Easner Banking",
        profile.productName,
        content,
        { text: "Open the app", url: data.dashboardUrl || profile.dashboardUrl },
        { audience: "personal", preheader: WELCOME_PERSONAL_PREHEADER, showPreferencesLink: true },
      )
    },
    text: (data: WelcomeEmailData) => {
      const profile = getEmailAudienceProfile("personal")
      return `Welcome to Easner Banking

${formatEasnerUserGreetingPlain(data.firstName)}

Congratulations on creating your Easner banking account. Send, receive, and track money in screens that feel like traditional banking, no complexity, no friction.

Complete identity verification in the app to unlock accounts and transfers where supported.

Add funds via bank deposit or stablecoin where enabled.

Save recipients and track activity in real time.

Fees and FX may apply; shown before you confirm.

${data.dashboardUrl || profile.dashboardUrl}${profile.signatureText ?? ""}`
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
    subject: (data: TeamInviteEmailData) =>
      `You're invited to ${data.businessName} on Easner Business`,
    html: (data: TeamInviteEmailData) => {
      const content = `
        ${easnerUserGreetingParagraphHtml(undefined)}
        <p class="confirmation-text">
          ${data.inviterName} invited you to join <strong>${data.businessName}</strong> on Easner Business as <strong>${data.role}</strong>.
        </p>
        <p class="confirmation-text">
          Use <strong>${data.inviteeEmail}</strong> when you create an account or sign in to accept this invitation.
        </p>
      `
      return generateBaseEmailTemplate(
        "Team invitation",
        "",
        content,
        { text: "Accept invitation", url: data.acceptUrl },
        {
          audience: "business",
          showPreferencesLink: false,
          recipientHasEasnerAccount: data.recipientHasEasnerAccount !== false,
        },
      )
    },
    text: (data: TeamInviteEmailData) =>
      `${formatEasnerUserGreetingPlain(undefined)}\n\n${data.inviterName} invited you to ${data.businessName} as ${data.role}.\n\nUse ${data.inviteeEmail} when you create an account or sign in.\n\nAccept: ${data.acceptUrl}`,
  },

  payrollEasetagInvite: {
    subject: (data: PayrollEasetagInviteEmailData) =>
      `${data.businessName} wants to pay you via EASETAG`,
    html: (data: PayrollEasetagInviteEmailData) => {
      const content = `
        <p class="confirmation-text">
          Hi ${data.recipientName}, <strong>${data.businessName}</strong> added you to payroll on Easner.
        </p>
        <p class="confirmation-text">
          Claim your EASETAG on Easner Personal Banking to receive payments instantly and for free.
        </p>
      `
      return generateBaseEmailTemplate(
        "Get paid via EASETAG",
        "",
        content,
        { text: "Join Easner", url: data.signupUrl },
        { audience: "personal", showPreferencesLink: false },
      )
    },
    text: (data: PayrollEasetagInviteEmailData) =>
      `${data.businessName} wants to pay you via EASETAG. Join Easner: ${data.signupUrl}`,
  },

  payrollPaid: {
    subject: (data: PayrollPaidEmailData) => `You've been paid — ${data.businessName}`,
    html: (data: PayrollPaidEmailData) => {
      const content = `
        <p class="confirmation-text">
          Hi ${data.recipientName}, you received <strong>${data.amountDisplay}</strong> from <strong>${data.businessName}</strong>.
        </p>
        <p class="confirmation-text">Your pay stub is attached to this email.</p>
      `
      return generateBaseEmailTemplate("You've been paid", "", content, undefined, {
        audience: "personal",
        showPreferencesLink: false,
      })
    },
    text: (data: PayrollPaidEmailData) =>
      `You've been paid ${data.amountDisplay} by ${data.businessName}.`,
  },

  passwordChanged: securityTemplate("password_changed"),
  passwordResetCompleted: securityTemplate("password_reset_completed"),
  mfaEnabled: securityTemplate("mfa_enabled"),
  mfaDisabled: securityTemplate("mfa_disabled"),
  newDeviceLogin: securityTemplate("new_device"),

  adminTransactionNotification: {
    subject: (data: { status?: string; transactionId?: string }) =>
      `New transfer ${data.status === "pending" ? "created" : "updated"} – #${data.transactionId}`,
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
      return `Transaction ${data.transactionId} – ${data.status}\n${adminUrl}/transactions`
    },
  },
}

function verificationSubject(kind: "KYB" | "KYC", status: VerificationEmailData["status"]): string {
  if (kind === "KYC") {
    const kycSubjects = {
      submitted: "Your Easner KYC verification submitted",
      approved: "Your Easner KYC verification approved",
      rejected: "Your Easner KYC verification update",
    } as const
    return kycSubjects[status]
  }
  const kybSubjects = {
    submitted: "Your Easner KYB verification submitted",
    approved: "Your Easner KYB verification approved",
    rejected: "Your Easner KYB verification update",
  } as const
  return kybSubjects[status]
}

function verificationTemplate(
  kind: "KYB" | "KYC",
  audience: EmailAudience,
  status: VerificationEmailData["status"],
): EmailTemplate {
  const subjectLine = verificationSubject(kind, status)
  const bodies = {
    submitted: `We've received your ${kind} verification. We'll email you when there is an update.`,
    approved: `Your ${kind} verification is approved. You can now access features where enabled for your profile.`,
    rejected: `Your ${kind} verification could not be approved at this time.`,
  }
  const bodyLine = bodies[status]
  return {
    subject: () => subjectLine,
    preheader: () => bodyLine,
    html: (data: VerificationEmailData) => {
      const reasons =
        status === "rejected" && data.rejectionReasons?.length
          ? `<p class="confirmation-text"><strong>Details:</strong> ${data.rejectionReasons.join("; ")}</p>`
          : ""
      const profile = getEmailAudienceProfile(audience)
      const content = `
        ${easnerUserGreetingParagraphHtml(data.firstName)}
        <p class="confirmation-text">${bodies[status]}</p>
        ${reasons}
      `
      return generateBaseEmailTemplate(
        subjectLine,
        "",
        content,
        status === "approved"
          ? { text: "Go to dashboard", url: data.dashboardUrl || profile.dashboardUrl }
          : undefined,
        { audience, showPreferencesLink: false, preheader: bodyLine },
      )
    },
    text: (data: VerificationEmailData) => {
      const profile = getEmailAudienceProfile(audience)
      let t = `${subjectLine}\n\n${formatEasnerUserGreetingPlain(data.firstName)}\n\n${bodies[status]}`
      if (status === "rejected" && data.rejectionReasons?.length) {
        t += `\n\nDetails: ${data.rejectionReasons.join("; ")}`
      }
      if (status === "approved") t += `\n\n${data.dashboardUrl || profile.dashboardUrl}`
      return t
    },
  }
}

const PERSONAL_SECURITY_BATCH_SUBJECT = "Security update on your Easner account"
const BUSINESS_SECURITY_BATCH_SUBJECT = "Security update on your Easner Business account"

function securityEmailSubject(
  alertType: SecurityAlertEmailData["alertType"],
  audience: EmailAudience,
): string {
  if (
    audience === "personal" &&
    (alertType === "mfa_enabled" || alertType === "mfa_disabled" || alertType === "new_device")
  ) {
    return PERSONAL_SECURITY_BATCH_SUBJECT
  }
  if (
    audience === "business" &&
    (alertType === "mfa_enabled" || alertType === "mfa_disabled" || alertType === "new_device")
  ) {
    return BUSINESS_SECURITY_BATCH_SUBJECT
  }
  if (audience === "business") {
    const businessCopy: Record<SecurityAlertEmailData["alertType"], string> = {
      password_changed: "Your Easner Business password was changed",
      password_reset_completed: "Your Easner Business password was reset",
      mfa_enabled: BUSINESS_SECURITY_BATCH_SUBJECT,
      mfa_disabled: BUSINESS_SECURITY_BATCH_SUBJECT,
      new_device: BUSINESS_SECURITY_BATCH_SUBJECT,
    }
    return businessCopy[alertType]
  }
  const copy: Record<SecurityAlertEmailData["alertType"], string> = {
    password_changed: "Your Easner password was changed",
    password_reset_completed: "Your Easner password was reset",
    mfa_enabled: "Two-factor authentication enabled",
    mfa_disabled: "Two-factor authentication disabled",
    new_device: "New device registered on your Easner account",
  }
  return copy[alertType]
}

function securityTemplate(alertType: SecurityAlertEmailData["alertType"]): EmailTemplate {
  const copy: Record<SecurityAlertEmailData["alertType"], { body: string }> = {
    password_changed: {
      body: "Your account password was just changed. If you did not make this change, contact support immediately.",
    },
    password_reset_completed: {
      body: "Your account password was reset successfully. If you did not request this, contact support immediately.",
    },
    mfa_enabled: {
      body: "Two-factor authentication was enabled on your Easner account.",
    },
    mfa_disabled: {
      body: "Two-factor authentication was disabled on your Easner account. If you did not make this change, contact support immediately.",
    },
    new_device: {
      body: "A new device was registered to receive notifications on your account.",
    },
  }
  const c = copy[alertType]
  return {
    subject: (_data: SecurityAlertEmailData, audience = "personal") =>
      securityEmailSubject(alertType, audience),
    preheader: (_data: SecurityAlertEmailData) => c.body,
    html: (data: SecurityAlertEmailData, audience = "personal") => {
      const subject = securityEmailSubject(alertType, audience)
      const device =
        data.deviceLabel && alertType === "new_device"
          ? `<p class="confirmation-text">Device: ${data.deviceLabel}</p>`
          : ""
      const content = `
        ${easnerUserGreetingParagraphHtml(data.firstName)}
        <p class="confirmation-text">${c.body}</p>
        ${device}
      `
      return generateBaseEmailTemplate(subject, "", content, {
        text: "Contact support",
        url: EASNER_CONTACT_URL,
      }, { audience, showPreferencesLink: false, preheader: c.body })
    },
    text: (data: SecurityAlertEmailData, audience = "personal") => {
      const subject = securityEmailSubject(alertType, audience)
      return `${subject}\n\n${formatEasnerUserGreetingPlain(data.firstName)}\n\n${c.body}${data.deviceLabel ? `\nDevice: ${data.deviceLabel}` : ""}`
    },
  }
}
