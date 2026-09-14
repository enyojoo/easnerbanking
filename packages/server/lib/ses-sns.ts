import { createVerify } from "node:crypto"

const SNS_CERT_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com$/i

export type SnsEnvelope = {
  Type?: string
  MessageId?: string
  TopicArn?: string
  Message?: string
  SubscribeURL?: string
  UnsubscribeURL?: string
  Token?: string
  Timestamp?: string
  SignatureVersion?: string
  Signature?: string
  SigningCertURL?: string
}

function signingString(envelope: SnsEnvelope): string {
  const type = envelope.Type ?? ""
  const fields =
    type === "Notification"
      ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
      : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"]
  const record = envelope as Record<string, string | undefined>
  let out = ""
  for (const field of fields) {
    const value = record[field]
    if (value == null || value === "") continue
    out += `${field}\n${value}\n`
  }
  return out
}

export function parseSnsEnvelope(raw: string): SnsEnvelope {
  const parsed = JSON.parse(raw) as SnsEnvelope
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid SNS payload")
  }
  return parsed
}

export function isTrustedSnsCertUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    return url.protocol === "https:" && SNS_CERT_HOST.test(url.hostname) && url.pathname.endsWith(".pem")
  } catch {
    return false
  }
}

export async function verifySnsSignature(
  envelope: SnsEnvelope,
  fetchCert: (url: string) => Promise<string> = defaultFetchCert,
): Promise<boolean> {
  const certUrl = envelope.SigningCertURL?.trim() ?? ""
  const signature = envelope.Signature?.trim() ?? ""
  if (!certUrl || !signature || !isTrustedSnsCertUrl(certUrl)) return false

  const pem = await fetchCert(certUrl)
  const verifier = createVerify(envelope.SignatureVersion === "2" ? "sha256" : "sha1")
  verifier.update(signingString(envelope), "utf8")
  return verifier.verify(pem, signature, "base64")
}

async function defaultFetchCert(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch SNS signing cert (${response.status})`)
  return response.text()
}

export type SesEventKind = "bounce" | "complaint"

export type ParsedSesRecipientEvent = {
  kind: SesEventKind
  emails: string[]
  raw: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null
}

function emailsFromRecipients(list: unknown, key: string): string[] {
  if (!Array.isArray(list)) return []
  const out: string[] = []
  for (const item of list) {
    const row = asRecord(item)
    const email = typeof row?.[key] === "string" ? row[key].trim().toLowerCase() : ""
    if (email) out.push(email)
  }
  return out
}

export function parseSesNotificationMessage(message: string): ParsedSesRecipientEvent | null {
  const payload = JSON.parse(message) as unknown
  const record = asRecord(payload)
  if (!record) return null

  const type = String(record.notificationType ?? record.eventType ?? "").toLowerCase()
  if (type === "bounce") {
    const bounce = asRecord(record.bounce)
    const emails = emailsFromRecipients(bounce?.bouncedRecipients, "emailAddress")
    if (!emails.length) return null
    return { kind: "bounce", emails, raw: payload }
  }
  if (type === "complaint") {
    const complaint = asRecord(record.complaint)
    const emails = emailsFromRecipients(complaint?.complainedRecipients, "emailAddress")
    if (!emails.length) return null
    return { kind: "complaint", emails, raw: payload }
  }
  return null
}
