#!/usr/bin/env node
/**
 * Validate email-provider env before deploy. Does not call SES or SendGrid.
 * Usage: node packages/server/scripts/verify-email-env.mjs
 *
 * Default backend is AWS SES (Office Platform Control: email_provider).
 * Leave EMAIL_PROVIDER unset in production so Office owns the switch.
 */

function first(...keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return ""
}

let failed = false

function ok(label) {
  console.log(`OK: ${label}`)
}

function warn(label) {
  console.warn(`WARN: ${label}`)
}

function error(label) {
  console.error(`ERROR: ${label}`)
  failed = true
}

const envProvider = process.env.EMAIL_PROVIDER?.trim().toLowerCase()
if (envProvider) {
  if (envProvider === "ses" || envProvider === "sendgrid") {
    ok(`EMAIL_PROVIDER=${envProvider} (overrides Office setting)`)
  } else {
    error(`EMAIL_PROVIDER=${envProvider} is invalid (use ses or sendgrid)`)
  }
} else {
  ok("EMAIL_PROVIDER unset — Office Platform Control (system_settings.email_provider) decides; default ses")
}

const awsId = process.env.AWS_ACCESS_KEY_ID?.trim()
const awsSecret = process.env.AWS_SECRET_ACCESS_KEY?.trim()
const sesRegion = first("SES_REGION", "AWS_REGION") || "eu-west-2"
if (awsId && awsSecret) {
  ok(`SES credentials set (region ${sesRegion})`)
} else {
  const sesRequired = !envProvider || envProvider === "ses"
  if (sesRequired) error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for default SES")
  else warn("AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY missing (ok while EMAIL_PROVIDER=sendgrid)")
}

if (process.env.SENDGRID_API_KEY?.trim()) {
  ok("SENDGRID_API_KEY is set")
} else if (envProvider === "sendgrid") {
  error("SENDGRID_API_KEY is required when EMAIL_PROVIDER=sendgrid")
} else {
  warn("SENDGRID_API_KEY missing — Office cannot fall back to SendGrid until it is set")
}

const personalFrom = first("EMAIL_FROM", "SENDGRID_FROM_EMAIL") || "noreply@easner.com"
const personalName = first("EMAIL_FROM_NAME", "SENDGRID_FROM_NAME") || "Easner"
const businessFrom =
  first("BUSINESS_EMAIL_FROM", "SENDGRID_FROM_EMAIL_BUSINESS", "EMAIL_FROM", "SENDGRID_FROM_EMAIL") ||
  "business@easner.com"
const businessName = first("BUSINESS_EMAIL_FROM_NAME", "SENDGRID_FROM_NAME_BUSINESS") || "Easner Business"
const invoiceFrom = first("INVOICE_EMAIL_FROM", "SENDGRID_FROM_EMAIL_INVOICES") || "invoices@easner.com"
const invoiceName =
  first("INVOICE_EMAIL_FROM_NAME", "SENDGRID_FROM_NAME_INVOICES", "BUSINESS_EMAIL_FROM_NAME", "SENDGRID_FROM_NAME_BUSINESS") ||
  "Easner Business"
const receiptFrom = first("RECEIPT_EMAIL_FROM", "SENDGRID_FROM_EMAIL_RECEIPTS") || "receipt@easner.com"
const replyTo = first("EMAIL_REPLY_TO", "SENDGRID_REPLY_TO") || "support@easner.com"

console.log("\nResolved from profiles:")
console.log(`  personal: ${personalName} <${personalFrom}>`)
console.log(`  business: ${businessName} <${businessFrom}>`)
console.log(`  invoices: ${invoiceName} <${invoiceFrom}>`)
console.log(`  receipts: ${invoiceName} <${receiptFrom}>`)
console.log(`  reply-to: ${replyTo}`)

const complianceOpsEmail =
  process.env.EASNER_COMPLIANCE_OPS_EMAIL ||
  process.env.EASNER_KYB_OPS_EMAIL ||
  "compliance@easner.com"
console.log(`  compliance ops: ${complianceOpsEmail}`)

console.log("\nLedger transaction emails:")
const ledgerDisabled = ["false", "0", "off", "no"].includes(
  String(process.env.LEDGER_TRANSACTION_EMAIL_ENABLED ?? "").trim().toLowerCase(),
)
console.log(
  ledgerDisabled
    ? "  LEDGER_TRANSACTION_EMAIL_ENABLED=false (transaction emails OFF)"
    : "  default ON (set LEDGER_TRANSACTION_EMAIL_ENABLED=false to disable)",
)

console.log("\nOffice switch: Platform Control → Email provider (ses | sendgrid)")
console.log("SNS bounces: POST /api/internal/ses/events")

process.exit(failed ? 1 : 0)
