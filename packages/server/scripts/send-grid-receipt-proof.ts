#!/usr/bin/env npx tsx
/**
 * Send Grid money-transmission receipt proof emails (Lightspark disclosure footer).
 *
 * Usage:
 *   npx tsx packages/server/scripts/send-grid-receipt-proof.ts --to enyo@easner.com
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { emailService } from "../lib/email-service"
import type { TransactionEmailData } from "../lib/email-types"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return
  const text = fs.readFileSync(filePath, "utf8")
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnvFile(path.join(repoRoot, "business/.env.local"))
loadEnvFile(path.join(repoRoot, "business/.env"))

function parseTo(argv: string[]): string {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--to" && argv[i + 1]) return argv[++i].trim()
  }
  return "enyo@easner.com"
}

function buildProofs(): TransactionEmailData[] {
  return [
    {
      transactionId: "proof-grid-usd-payin-001",
      easnerTransactionId: "ET-GRID-USD-PAYIN-001",
      title: "Bank Deposit",
      body: "$1,000.00 USD credited to your USD Balance.",
      firstName: "Enyo",
      amountDisplay: "$1,000.00",
      counterpartyLabel: "From",
      counterpartyName: "Acme Corp operating account",
      category: "Bank Deposit",
      paymentRail: "ACH",
      status: "settled",
      createdAt: "2026-08-12T15:10:00.000Z",
      outcome: "success",
      audience: "business",
      detailUrl: "https://business.easner.com/transactions/ET-GRID-USD-PAYIN-001",
      emailSubject: "Your Easner transfer receipt - USD deposit",
      isGridMoneyTransmissionReceipt: true,
      gridTransactionId: "Transaction:019542f5-b3e7-1d02-0000-000000000041",
      includeForeignRemittanceDisclosure: false,
      detailRows: [
        { label: "Grid transaction ID", value: "Transaction:019542f5-b3e7-1d02-0000-000000000041" },
        { label: "Easner reference", value: "ET-GRID-USD-PAYIN-001" },
        { label: "Sender", value: "Acme Corp operating account" },
        { label: "Recipient", value: "Acme Corp (Easner USD balance)" },
        { label: "Transaction type", value: "INCOMING - USD pay-in / fund balance" },
        { label: "Transfer amount", value: "$1,000.00 USD" },
        { label: "Total to recipient", value: "$1,000.00 USD" },
        { label: "Total transfer fees", value: "$0.00 USD" },
        { label: "Taxes", value: "$0.00" },
        { label: "Total", value: "$1,000.00 USD" },
        { label: "When", value: "Aug 12, 2026, 3:10:00 PM PDT" },
      ],
    },
    {
      transactionId: "proof-grid-usd-php-payout-001",
      easnerTransactionId: "ET-GRID-USD-PHP-001",
      title: "Balance payout",
      body: "Your payout of $250.00 USD to Juan Dela Cruz (PHP) is complete.",
      firstName: "Enyo",
      amountDisplay: "$252.50",
      counterpartyLabel: "Recipient",
      counterpartyName: "Juan Dela Cruz",
      category: "Balance payout",
      paymentRail: "Bank transfer",
      status: "settled",
      createdAt: "2026-08-12T15:20:00.000Z",
      outcome: "success",
      audience: "business",
      detailUrl: "https://business.easner.com/transactions/ET-GRID-USD-PHP-001",
      emailSubject: "Your Easner transfer receipt - USD payout to PHP",
      isGridMoneyTransmissionReceipt: true,
      gridTransactionId: "Transaction:019542f5-b3e7-1d02-0000-000000000042",
      includeForeignRemittanceDisclosure: true,
      detailRows: [
        { label: "Grid transaction ID", value: "Transaction:019542f5-b3e7-1d02-0000-000000000042" },
        { label: "Easner reference", value: "ET-GRID-USD-PHP-001" },
        { label: "Sender", value: "Acme Corp" },
        { label: "Recipient", value: "Juan Dela Cruz" },
        { label: "Transaction type", value: "OUTGOING - USD balance payout to PHP" },
        { label: "Transfer amount", value: "$250.00 USD" },
        { label: "Total to recipient", value: "₱14,125.00 PHP" },
        { label: "Total transfer fees", value: "$2.50 USD" },
        { label: "Taxes", value: "$0.00" },
        { label: "Total", value: "$252.50 USD" },
        { label: "Exchange rate", value: "1 USD = 56.50 PHP" },
        { label: "When", value: "Aug 12, 2026, 3:20:00 PM PDT" },
      ],
    },
  ]
}

async function main() {
  const to = parseTo(process.argv.slice(2))
  if (!process.env.SENDGRID_API_KEY?.trim()) {
    console.error("ERROR: SENDGRID_API_KEY required (business/.env.local)")
    process.exit(1)
  }

  for (const data of buildProofs()) {
    const result = await emailService.sendTransactionSettledEmail(to, data)
    if (!result.success) {
      console.error(`FAILED ${data.easnerTransactionId}:`, result.error)
      process.exit(1)
    }
    console.log(
      `OK ${data.emailSubject} → ${to} (messageId=${result.messageId ?? "sent"})`,
    )
  }
  console.log("Note: sample transaction data for Lightspark disclosure review; not live Grid sandbox settles.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
