/** Provider-agnostic from/reply addresses. `EMAIL_*` wins; `SENDGRID_*` remains fallback. */

function firstEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return undefined
}

export function resolvePersonalFromEmail(): string {
  return firstEnv("EMAIL_FROM", "SENDGRID_FROM_EMAIL") || "noreply@easner.com"
}

export function resolvePersonalFromName(): string {
  return firstEnv("EMAIL_FROM_NAME", "SENDGRID_FROM_NAME") || "Easner"
}

export function resolveBusinessFromEmail(): string {
  return (
    firstEnv("BUSINESS_EMAIL_FROM", "SENDGRID_FROM_EMAIL_BUSINESS", "EMAIL_FROM", "SENDGRID_FROM_EMAIL") ||
    "business@easner.com"
  )
}

export function resolveBusinessFromName(): string {
  return firstEnv("BUSINESS_EMAIL_FROM_NAME", "SENDGRID_FROM_NAME_BUSINESS") || "Easner Business"
}

export function resolveInvoiceFromEmailAddress(): string {
  return firstEnv("INVOICE_EMAIL_FROM", "SENDGRID_FROM_EMAIL_INVOICES") || "invoices@easner.com"
}

export function resolveInvoiceFromName(): string {
  return firstEnv("INVOICE_EMAIL_FROM_NAME", "SENDGRID_FROM_NAME_INVOICES") || resolveBusinessFromName()
}

export function resolveReceiptFromEmailAddress(): string {
  return firstEnv("RECEIPT_EMAIL_FROM", "SENDGRID_FROM_EMAIL_RECEIPTS") || "receipt@easner.com"
}

export function resolveEmailReplyTo(): string {
  return firstEnv("EMAIL_REPLY_TO", "SENDGRID_REPLY_TO") || "support@easner.com"
}
