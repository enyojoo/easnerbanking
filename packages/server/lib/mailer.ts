import type { SendEmailResult } from "./email-types"
import { isEmailProviderCredentialsConfigured, type EmailProvider } from "./email-provider"
import { isEmailSuppressed } from "./email-suppressions"
import { resolveEmailProvider } from "./resolve-email-provider"
import { sendViaSendGrid } from "./sendgrid-mailer"
import { sendViaSes } from "./ses-mailer"
import type { SendMailInput } from "./mailer-types"

export type { SendMailInput, MailAddress } from "./mailer-types"

export type MailerDeps = {
  resolveProvider?: () => Promise<EmailProvider>
  isSuppressed?: (email: string) => Promise<boolean>
  sendSes?: (input: SendMailInput) => Promise<SendEmailResult>
  sendSendgrid?: (input: SendMailInput) => Promise<SendEmailResult>
}

export async function sendMail(
  input: SendMailInput,
  deps: MailerDeps = {},
): Promise<SendEmailResult> {
  const resolveProvider = deps.resolveProvider ?? resolveEmailProvider
  const isSuppressed = deps.isSuppressed ?? isEmailSuppressed
  const sendSes = deps.sendSes ?? sendViaSes
  const sendSendgrid = deps.sendSendgrid ?? sendViaSendGrid

  try {
    if (await isSuppressed(input.to)) {
      console.info(`[email] skipped to=${input.to}: suppressed`)
      return { success: true, skipped: true, skipReason: "suppressed" }
    }

    const provider = await resolveProvider()
    if (!isEmailProviderCredentialsConfigured(provider)) {
      const error =
        provider === "ses"
          ? "SES credentials missing (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)"
          : "SendGrid credentials missing (SENDGRID_API_KEY)"
      console.error(`[email] ${error}`)
      return { success: false, error }
    }

    return provider === "sendgrid" ? await sendSendgrid(input) : await sendSes(input)
  } catch (error) {
    console.error("Email sending failed:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
