import type { EmailAttachment } from "./email-types"

export type MailAddress = string | { email: string; name?: string }

export type SendMailInput = {
  to: string
  from: MailAddress
  replyTo?: MailAddress
  subject: string
  html: string
  text: string
  attachments?: EmailAttachment[]
}
