// Main email service using SendGrid API

import sgMail from "@sendgrid/mail"
import { emailTemplates } from "./email-templates"
import { shouldSendTemplatedEmail } from "./communication-email-guard"
import {
  getEmailAudienceProfile,
  resolveEmailAudienceFromData,
  type EmailAudience,
} from "./email-audience"
import type {
  AppDownloadLinkEmailData,
  EmailData,
  EmailServiceConfig,
  SendGridResponse,
  TransactionEmailData,
  WelcomeEmailData,
} from "./email-types"

let apiKeyInitialized = false
function ensureSendGridInitialized() {
  if (!apiKeyInitialized) {
    const key = process.env.SENDGRID_API_KEY
    if (!key) throw new Error("SENDGRID_API_KEY environment variable is required")
    sgMail.setApiKey(key)
    apiKeyInitialized = true
  }
}

function resolveAudience(emailData: EmailData): EmailAudience {
  if (emailData.audience) return emailData.audience
  return resolveEmailAudienceFromData(emailData.data ?? {})
}

export class EmailService {
  private config: EmailServiceConfig

  constructor(config?: Partial<EmailServiceConfig>) {
    this.config = {
      fromEmail: process.env.SENDGRID_FROM_EMAIL || "noreply@easner.com",
      fromName: process.env.SENDGRID_FROM_NAME || "Easner",
      replyTo: process.env.SENDGRID_REPLY_TO || "support@easner.com",
      ...config,
    }
  }

  private fromForAudience(audience: EmailAudience) {
    const profile = getEmailAudienceProfile(audience)
    const email =
      audience === "business"
        ? process.env.SENDGRID_FROM_EMAIL_BUSINESS || process.env.SENDGRID_FROM_EMAIL || "invoices@easner.com"
        : this.config.fromEmail
    return { email, name: profile.fromName }
  }

  async sendEmail(
    emailData: EmailData,
    communicationPreferences?: unknown,
  ): Promise<SendGridResponse> {
    try {
      const { send, reason } = shouldSendTemplatedEmail(
        emailData.template,
        communicationPreferences,
      )
      if (!send) {
        console.info(
          `[email] skipped template=${emailData.template} to=${emailData.to}: ${reason ?? "opt-out"}`,
        )
        return { success: true, skipped: true, skipReason: reason }
      }

      ensureSendGridInitialized()
      const template = emailTemplates[emailData.template]
      if (!template) {
        throw new Error(`Email template '${emailData.template}' not found`)
      }

      const audience = resolveAudience(emailData)
      const subject =
        typeof template.subject === "function"
          ? template.subject(emailData.data, audience)
          : template.subject

      const msg: Record<string, unknown> = {
        to: emailData.to,
        from: this.fromForAudience(audience),
        replyTo: this.config.replyTo,
        subject,
        html: template.html(emailData.data, audience),
        text: template.text(emailData.data, audience),
      }
      if (emailData.attachments?.length) {
        msg.attachments = emailData.attachments.map((a) => ({
          content: a.content,
          filename: a.filename,
          type: a.type,
          disposition: a.disposition ?? "attachment",
        }))
      }

      const response = await sgMail.send(msg)
      return {
        success: true,
        messageId: response[0].headers["x-message-id"] as string,
      }
    } catch (error) {
      console.error("Email sending failed:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  async sendWelcomeEmail(
    userData: WelcomeEmailData,
    communicationPreferences?: unknown,
  ): Promise<SendGridResponse> {
    const audience = userData.audience ?? "personal"
    return this.sendEmail(
      {
        to: userData.email,
        template: audience === "business" ? "welcomeBusiness" : "welcomePersonal",
        data: userData,
        audience,
      },
      communicationPreferences,
    )
  }

  async sendTransactionSettledEmail(
    userEmail: string,
    data: TransactionEmailData,
    communicationPreferences?: unknown,
  ): Promise<SendGridResponse> {
    const template =
      data.outcome === "failed"
        ? "transactionFailed"
        : data.outcome === "reversed"
          ? "transactionReversed"
          : "transactionSettled"
    return this.sendEmail(
      {
        to: userEmail,
        template,
        data,
        audience: data.audience,
      },
      communicationPreferences,
    )
  }

  async sendTestEmail(to: string, audience: EmailAudience = "personal"): Promise<SendGridResponse> {
    const profile = getEmailAudienceProfile(audience)
    return this.sendEmail({
      to,
      template: audience === "business" ? "welcomeBusiness" : "welcomePersonal",
      data: {
        firstName: "Test",
        email: to,
        dashboardUrl: profile.dashboardUrl,
        audience,
      },
      audience,
    })
  }

  async sendAppDownloadLinkEmail(
    data: AppDownloadLinkEmailData,
  ): Promise<SendGridResponse> {
    return this.sendEmail(
      {
        to: data.email,
        template: "appDownloadLink",
        data,
        audience: "personal",
      },
      undefined,
    )
  }
}

export const emailService = new EmailService()

export const {
  sendWelcomeEmail,
  sendTransactionSettledEmail,
  sendTestEmail,
  sendAppDownloadLinkEmail,
} = emailService
