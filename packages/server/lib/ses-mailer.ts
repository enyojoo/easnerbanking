import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2"
import type { SendEmailResult } from "./email-types"
import { formatMimeAddress, buildRawMimeMessage, type MimeAddress } from "./mime-message"
import { resolveSesRegion } from "./email-provider"
import type { SendMailInput } from "./mailer-types"

let client: SESv2Client | null = null

function getSesClient(): SESv2Client {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for SES")
  }
  if (!client) {
    client = new SESv2Client({
      region: resolveSesRegion(),
      credentials: { accessKeyId, secretAccessKey },
    })
  }
  return client
}

export function resetSesClientForTests(): void {
  client = null
}

function asMimeAddress(value: SendMailInput["from"]): MimeAddress {
  if (typeof value === "string") return { email: value }
  return value
}

function resolveSesConfigurationSetName(): string | undefined {
  const name = process.env.SES_CONFIGURATION_SET?.trim()
  return name || undefined
}

export async function sendViaSes(input: SendMailInput): Promise<SendEmailResult> {
  const from = asMimeAddress(input.from)
  const fromHeader = formatMimeAddress(from)
  const hasAttachments = Boolean(input.attachments?.length)
  const configurationSetName = resolveSesConfigurationSetName()
  const command = hasAttachments
    ? new SendEmailCommand({
        FromEmailAddress: fromHeader,
        Destination: { ToAddresses: [input.to] },
        ReplyToAddresses: input.replyTo
          ? [typeof input.replyTo === "string" ? input.replyTo : formatMimeAddress(input.replyTo)]
          : undefined,
        ...(configurationSetName ? { ConfigurationSetName: configurationSetName } : {}),
        Content: {
          Raw: { Data: buildRawMimeMessage(input) },
        },
      })
    : new SendEmailCommand({
        FromEmailAddress: fromHeader,
        Destination: { ToAddresses: [input.to] },
        ReplyToAddresses: input.replyTo
          ? [typeof input.replyTo === "string" ? input.replyTo : formatMimeAddress(input.replyTo)]
          : undefined,
        ...(configurationSetName ? { ConfigurationSetName: configurationSetName } : {}),
        Content: {
          Simple: {
            Subject: { Data: input.subject, Charset: "UTF-8" },
            Body: {
              Html: { Data: input.html, Charset: "UTF-8" },
              Text: { Data: input.text, Charset: "UTF-8" },
            },
          },
        },
      })

  const response = await getSesClient().send(command)
  return { success: true, messageId: response.MessageId }
}
