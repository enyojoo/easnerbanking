#!/usr/bin/env node
/**
 * Validate SendGrid-related env before deploy. Does not call SendGrid API.
 * Usage: node packages/server/scripts/verify-sendgrid-env.mjs
 */

const required = ["SENDGRID_API_KEY"]
const recommended = [
  "SENDGRID_FROM_EMAIL",
  "SENDGRID_FROM_EMAIL_BUSINESS",
  "SENDGRID_FROM_NAME",
  "SENDGRID_FROM_NAME_BUSINESS",
  "SENDGRID_REPLY_TO",
]

let failed = false

for (const key of required) {
  if (!process.env[key]?.trim()) {
    console.error(`ERROR: missing required env ${key}`)
    failed = true
  } else {
    console.log(`OK: ${key} is set`)
  }
}

for (const key of recommended) {
  if (!process.env[key]?.trim()) {
    console.warn(`WARN: missing recommended env ${key}`)
  } else {
    console.log(`OK: ${key}=${process.env[key]}`)
  }
}

const personalFrom = process.env.SENDGRID_FROM_EMAIL || "noreply@easner.com"
const personalName = process.env.SENDGRID_FROM_NAME || "Easner"
const businessFrom =
  process.env.SENDGRID_FROM_EMAIL_BUSINESS ||
  process.env.SENDGRID_FROM_EMAIL ||
  "invoices@easner.com"
const businessName = process.env.SENDGRID_FROM_NAME_BUSINESS || "Easner Business"
const replyTo = process.env.SENDGRID_REPLY_TO || "support@easner.com"

console.log("\nResolved from profiles:")
console.log(`  personal: ${personalName} <${personalFrom}>`)
console.log(`  business: ${businessName} <${businessFrom}>`)
console.log(`  reply-to: ${replyTo}`)

console.log("\nLedger transaction emails:")
const ledgerDisabled =
  ["false", "0", "off", "no"].includes(
    String(process.env.LEDGER_TRANSACTION_EMAIL_ENABLED ?? "").trim().toLowerCase(),
  )
console.log(
  ledgerDisabled
    ? "  LEDGER_TRANSACTION_EMAIL_ENABLED=false (transaction emails OFF)"
    : "  default ON (set LEDGER_TRANSACTION_EMAIL_ENABLED=false to disable)",
)

process.exit(failed ? 1 : 0)
