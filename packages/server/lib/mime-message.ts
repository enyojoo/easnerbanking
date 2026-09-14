import type { EmailAttachment } from "./email-types"

export type MimeAddress = { email: string; name?: string }

function encodeHeaderWord(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
}

export function formatMimeAddress(address: MimeAddress | string): string {
  if (typeof address === "string") return address.trim()
  const email = address.email.trim()
  const name = address.name?.trim()
  if (!name) return email
  return `${encodeHeaderWord(name)} <${email}>`
}

function randomBoundary(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

function wrapBase64(value: string): string {
  const compact = value.replace(/\s+/g, "")
  const lines: string[] = []
  for (let i = 0; i < compact.length; i += 76) {
    lines.push(compact.slice(i, i + 76))
  }
  return lines.join("\r\n")
}

function encodeBody(value: string): string {
  return wrapBase64(Buffer.from(value, "utf8").toString("base64"))
}

function filenameHeader(filename: string): string {
  if (/^[\x20-\x7E]*$/.test(filename) && !filename.includes('"')) {
    return `filename="${filename}"`
  }
  return `filename*=UTF-8''${encodeURIComponent(filename)}`
}

export function buildRawMimeMessage(input: {
  to: string
  from: MimeAddress | string
  replyTo?: MimeAddress | string
  subject: string
  html: string
  text: string
  attachments?: EmailAttachment[]
}): Uint8Array {
  const mixed = randomBoundary("mixed")
  const alt = randomBoundary("alt")
  const headers = [
    `From: ${formatMimeAddress(input.from)}`,
    `To: ${input.to.trim()}`,
    input.replyTo ? `Reply-To: ${formatMimeAddress(input.replyTo)}` : null,
    `Subject: ${encodeHeaderWord(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
  ].filter((line): line is string => Boolean(line))

  const parts: string[] = [
    headers.join("\r\n"),
    "",
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    `--${alt}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodeBody(input.text),
    `--${alt}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodeBody(input.html),
    `--${alt}--`,
  ]

  for (const attachment of input.attachments ?? []) {
    const type = attachment.type || "application/octet-stream"
    const disposition = attachment.disposition ?? "attachment"
    parts.push(
      `--${mixed}`,
      `Content-Type: ${type}; name="${attachment.filename.replace(/"/g, "")}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: ${disposition}; ${filenameHeader(attachment.filename)}`,
      "",
      wrapBase64(attachment.content),
    )
  }

  parts.push(`--${mixed}--`, "")
  return Buffer.from(parts.join("\r\n"), "utf8")
}
