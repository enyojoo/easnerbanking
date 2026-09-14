import { emailTemplates } from "./email-templates"
import { shouldSendTemplatedEmail } from "./communication-email-guard"
import {
  getEmailAudienceProfile,
  resolveEmailAudienceFromData,
  type EmailAudience,
} from "./email-audience"
import {
  resolveBusinessFromEmail,
  resolveEmailReplyTo,
  resolvePersonalFromEmail,
  resolvePersonalFromName,
} from "./email-from"
import { sendMail } from "./mailer"
import type {
  AppDownloadLinkEmailData,
  EmailData,
  EmailServiceConfig,
  SendEmailResult,
  TransactionEmailData,
  WelcomeEmailData,
} from "./email-types"

function resolveAudience(emailData: EmailData): EmailAudience {
  if (emailData.audience) return emailData.audience
  return resolveEmailAudienceFromData(emailData.data ?? {})
}

export class EmailService {
  private config: EmailServiceConfig

  constructor(config?: Partial<EmailServiceConfig>) {
    this.config = {
      fromEmail: resolvePersonalFromEmail(),
      fromName: resolvePersonalFromName(),
      replyTo: resolveEmailReplyTo(),
      ...config,
    }
  }

  private fromForAudience(audience: EmailAudience) {
    const profile = getEmailAudienceProfile(audience)
    const email = audience === "business" ? resolveBusinessFromEmail() : this.config.fromEmail
    return { email, name: profile.fromName }
  }

  async sendEmail(
    emailData: EmailData,
    communicationPreferences?: unknown,
  ): Promise<SendEmailResult> {
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

      const template = emailTemplates[emailData.template]
      if (!template) {
        throw new Error(`Email template '${emailData.template}' not found`)
      }

      const audience = resolveAudience(emailData)
      const subject =
        typeof template.subject === "function"
          ? template.subject(emailData.data, audience)
          : template.subject

      return await sendMail({
        to: emailData.to,
        from: this.fromForAudience(audience),
        replyTo: this.config.replyTo,
        subject,
        html: template.html(emailData.data, audience),
        text: template.text(emailData.data, audience),
        attachments: emailData.attachments,
      })
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
  ): Promise<SendEmailResult> {
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
  ): Promise<SendEmailResult> {
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

  async sendTestEmail(to: string, audience: EmailAudience = "personal"): Promise<SendEmailResult> {
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
  ): Promise<SendEmailResult> {
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
