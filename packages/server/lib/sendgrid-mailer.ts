import sgMail from "@sendgrid/mail"
import type { SendEmailResult } from "./email-types"
import type { SendMailInput } from "./mailer-types"

let apiKeyInitialized = false

function ensureSendGridInitialized() {
  if (apiKeyInitialized) return
  const key = process.env.SENDGRID_API_KEY
  if (!key) throw new Error("SENDGRID_API_KEY environment variable is required")
  sgMail.setApiKey(key)
  apiKeyInitialized = true
}

export function resetSendGridClientForTests(): void {
  apiKeyInitialized = false
}

export async function sendViaSendGrid(input: SendMailInput): Promise<SendEmailResult> {
  ensureSendGridInitialized()
  const from =
    typeof input.from === "string"
      ? input.from
      : { email: input.from.email, name: input.from.name }
  const replyTo =
    !input.replyTo
      ? undefined
      : typeof input.replyTo === "string"
        ? input.replyTo
        : { email: input.replyTo.email, name: input.replyTo.name }

  const msg: Record<string, unknown> = {
    to: input.to,
    from,
    subject: input.subject,
    html: input.html,
    text: input.text,
  }
  if (replyTo) msg.replyTo = replyTo
  if (input.attachments?.length) {
    msg.attachments = input.attachments.map((a) => ({
      content: a.content,
      filename: a.filename,
      type: a.type,
      disposition: a.disposition ?? "attachment",
    }))
  }

  const response = await sgMail.send(msg as never)
  return {
    success: true,
    messageId: response[0].headers["x-message-id"] as string | undefined,
  }
}
