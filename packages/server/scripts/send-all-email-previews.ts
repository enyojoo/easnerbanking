#!/usr/bin/env npx tsx
/**
 * Send one preview of every registered email template via the shared mailer (SES default).
 *
 * Usage (from repo root, with business/.env.local containing AWS SES creds):
 *   npx tsx packages/server/scripts/send-all-email-previews.ts
 *   EMAIL_PROVIDER=sendgrid npx tsx packages/server/scripts/send-all-email-previews.ts
 *   npx tsx packages/server/scripts/send-all-email-previews.ts --to enyocreative@gmail.com
 *   npx tsx packages/server/scripts/send-all-email-previews.ts --dry-run
 *   npx tsx packages/server/scripts/send-all-email-previews.ts --template welcomePersonal
 *   npx tsx packages/server/scripts/send-all-email-previews.ts --from-db --to enyocreative@gmail.com
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { EmailAudience } from "../lib/email-audience"
import { emailService } from "../lib/email-service"
import type { TransactionEmailData } from "../lib/email-types"
import { templateDefaultAudience, templateFixtures, balanceMoveSettledFixture } from "../lib/email-test-fixtures"

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

const TRANSACTION_TEMPLATES = new Set([
  "transactionSettled",
  "transactionFailed",
  "transactionReversed",
])

function parseArgs(argv: string[]) {
  let to = "enyocreative@gmail.com"
  let dryRun = false
  let fromDb = false
  let templateFilter: string | null = null
  let includeAdmin = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--dry-run") dryRun = true
    else if (arg === "--from-db") fromDb = true
    else if (arg === "--include-admin") includeAdmin = true
    else if (arg === "--to" && argv[i + 1]) to = argv[++i].trim()
    else if (arg === "--template" && argv[i + 1]) templateFilter = argv[++i].trim()
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: npx tsx packages/server/scripts/send-all-email-previews.ts [options]

Options:
  --to <email>           Recipient (default: enyocreative@gmail.com)
  --template <key>       Send only one template (e.g. welcomePersonal)
  --from-db              Load first_name from public.users for --to email
  --include-admin        Include adminTransactionNotification (ops internal)
  --dry-run              Print templates without sending
  --help                 Show this help
`)
      process.exit(0)
    }
  }

  return { to, dryRun, fromDb, templateFilter, includeAdmin }
}

async function loadUserProfile(email: string): Promise<{ firstName: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.warn("WARN: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set – skipping --from-db")
    return null
  }

  const { createClient } = await import("@supabase/supabase-js")
  const admin = createClient(url, key, { auth: { persistSession: false } })
  const { data } = await admin
    .from("users")
    .select("email,full_name,first_name")
    .ilike("email", email)
    .maybeSingle()

  if (!data) {
    console.warn(`WARN: no users row for ${email}`)
    return null
  }

  const full = String(data.full_name ?? "").trim()
  const first =
    String(data.first_name ?? "").trim() ||
    full.split(/\s+/)[0] ||
    email.split("@")[0] ||
    "there"

  console.log(`Loaded profile for ${email}: firstName=${first}`)
  return { firstName: first }
}

function personalizeFixture(templateKey: string, data: unknown, to: string, firstName: string): unknown {
  if (!data || typeof data !== "object") return data
  const copy = { ...(data as Record<string, unknown>) }

  if ("email" in copy) copy.email = to
  if ("inviteeEmail" in copy) copy.inviteeEmail = to
  if ("firstName" in copy) copy.firstName = firstName

  if (TRANSACTION_TEMPLATES.has(templateKey)) {
    const tx = copy as TransactionEmailData
    tx.detailUrl = tx.detailUrl?.replace(/@[^/]+/, "") // noop safety
    tx.easnerTransactionId = `PREVIEW-${templateKey.toUpperCase()}`
  }

  return copy
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sendOne(
  templateKey: string,
  to: string,
  data: unknown,
  dryRun: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const audience: EmailAudience = templateDefaultAudience[templateKey] ?? "personal"

  if (dryRun) {
    console.log(`[dry-run] would send ${templateKey} → ${to} (${audience})`)
    return { ok: true }
  }

  if (TRANSACTION_TEMPLATES.has(templateKey)) {
    const tx = { ...(data as TransactionEmailData), audience }
    const result = await emailService.sendTransactionSettledEmail(to, tx)
    if (!result.success) return { ok: false, error: result.error }
    console.log(`OK ${templateKey} → ${to} (${result.messageId ?? "sent"})`)
    return { ok: true }
  }

  const result = await emailService.sendEmail({
    to,
    template: templateKey,
    data,
    audience,
  })

  if (!result.success) return { ok: false, error: result.error }
  if (result.skipped) {
    console.log(`SKIP ${templateKey} → ${to} (${result.skipReason ?? "skipped"})`)
    return { ok: true }
  }
  console.log(`OK ${templateKey} → ${to} (${result.messageId ?? "sent"})`)
  return { ok: true }
}

async function main() {
  const { to, dryRun, fromDb, templateFilter, includeAdmin } = parseArgs(process.argv.slice(2))

  if (!dryRun) {
    const provider = (process.env.EMAIL_PROVIDER?.trim().toLowerCase() || "ses") === "sendgrid" ? "sendgrid" : "ses"
    const ready =
      provider === "sendgrid"
        ? Boolean(process.env.SENDGRID_API_KEY?.trim())
        : Boolean(process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim())
    if (!ready) {
      console.error(
        provider === "sendgrid"
          ? "ERROR: SENDGRID_API_KEY is required when EMAIL_PROVIDER=sendgrid"
          : "ERROR: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for SES (or set EMAIL_PROVIDER=sendgrid)",
      )
      process.exit(1)
    }
  }

  const profile = fromDb ? await loadUserProfile(to) : null
  const firstName = profile?.firstName ?? to.split("@")[0] ?? "there"

  let keys = Object.keys(templateFixtures)
  if (!includeAdmin) {
    keys = keys.filter((k) => k !== "adminTransactionNotification")
  }
  if (templateFilter) {
    if (!templateFixtures[templateFilter]) {
      console.error(`Unknown template: ${templateFilter}`)
      console.error("Available:", Object.keys(templateFixtures).join(", "))
      process.exit(1)
    }
    keys = [templateFilter]
  }

  console.log(
    dryRun
      ? `Dry run – ${keys.length} template(s) → ${to}`
      : `Sending ${keys.length} template preview(s) → ${to}`,
  )

  let failed = 0
  for (const templateKey of keys) {
    const data = personalizeFixture(templateKey, templateFixtures[templateKey], to, firstName)
    const result = await sendOne(templateKey, to, data, dryRun)
    if (!result.ok) {
      failed++
      console.error(`FAIL ${templateKey}: ${result.error}`)
    }
    if (!dryRun) await sleep(400)
  }

  if (!templateFilter || templateFilter === "balanceMoveSettled") {
    const moveData = personalizeFixture(
      "transactionSettled",
      balanceMoveSettledFixture,
      to,
      firstName,
    )
    const moveResult = await sendOne("transactionSettled", to, moveData, dryRun)
    if (!moveResult.ok) {
      failed++
      console.error(`FAIL balanceMoveSettled preview: ${moveResult.error}`)
    } else if (dryRun) {
      console.log("[dry-run] would send balanceMoveSettled preview → transactionSettled template")
    } else {
      console.log("OK balanceMoveSettled preview → transactionSettled (sent)")
    }
    if (!dryRun) await sleep(400)
  }

  console.log(failed === 0 ? "\nDone." : `\nFinished with ${failed} failure(s).`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
