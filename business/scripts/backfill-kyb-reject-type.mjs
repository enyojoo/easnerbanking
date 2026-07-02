#!/usr/bin/env node
/**
 * Normalize Final Noah rejects and strip placeholder regional decline copy.
 *
 * Usage:
 *   node business/scripts/backfill-kyb-reject-type.mjs
 *   node business/scripts/backfill-kyb-reject-type.mjs --execute
 */
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const PLACEHOLDER_MESSAGES = new Set([
  "Verification declined for this region.",
  "Verification was declined. Review your documents and details, then try again or contact support if you need help.",
])

const __dir = dirname(fileURLToPath(import.meta.url))

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dir, "../.env.local"), "utf8")
    for (const line of raw.split("\n")) {
      const t = line.trim()
      if (!t || t.startsWith("#")) continue
      const i = t.indexOf("=")
      if (i === -1) continue
      const key = t.slice(0, i).trim()
      let value = t.slice(i + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    // .env.local optional when vars are already exported
  }
}

loadEnvLocal()

const execute = process.argv.includes("--execute")

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in business/.env.local")
  process.exit(1)
}

const admin = createClient(url, key, { auth: { persistSession: false } })

const FINAL_ONLY = [{ rejectType: "Final" }]

function readText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function isPlaceholderReason(item) {
  if (typeof item === "string") return PLACEHOLDER_MESSAGES.has(item.trim())
  if (!item || typeof item !== "object") return true
  const o = item
  const detail =
    readText(o.publicComment) ??
    readText(o.PublicComment) ??
    readText(o.reason) ??
    readText(o.message)
  if (!detail) return false
  return PLACEHOLDER_MESSAGES.has(detail)
}

function hasFinalRejectType(reasons) {
  if (!Array.isArray(reasons)) return false
  return reasons.some((item) => {
    if (!item || typeof item !== "object") return false
    const t = readText(item.rejectType ?? item.RejectType)
    return t?.toLowerCase() === "final"
  })
}

function onlyPlaceholderReasons(reasons) {
  if (!Array.isArray(reasons) || reasons.length === 0) return false
  return reasons.every((item) => isPlaceholderReason(item))
}

function shouldNormalizeToFinal(reasons) {
  if (!Array.isArray(reasons) || reasons.length === 0) return false
  if (hasFinalRejectType(reasons)) return true
  if (onlyPlaceholderReasons(reasons)) return true
  return false
}

function stripPlaceholders(reasons) {
  if (!Array.isArray(reasons)) return reasons
  return reasons.filter((item) => !isPlaceholderReason(item))
}

function planPatch(table, row, column, statusColumn) {
  const status = readText(row[statusColumn])?.toLowerCase()
  if (status !== "rejected") return null

  const reasons = row[column]
  if (!Array.isArray(reasons) || reasons.length === 0) return null

  if (shouldNormalizeToFinal(reasons)) {
    const next = FINAL_ONLY
    if (JSON.stringify(reasons) === JSON.stringify(next)) return null
    return { table, id: row.id, column, next, note: "normalize Final" }
  }

  const stripped = stripPlaceholders(reasons)
  if (stripped.length === 0) return null
  if (JSON.stringify(stripped) === JSON.stringify(reasons)) return null
  return { table, id: row.id, column, next: stripped, note: "strip placeholder copy" }
}

async function loadRejected(table, statusCol, reasonsCol) {
  const { data, error } = await admin
    .from(table)
    .select(`id,${statusCol},${reasonsCol}`)
    .eq(statusCol, "rejected")
  if (error) throw error
  return (data ?? []).map((row) => ({ ...row, table, statusCol, reasonsCol }))
}

async function main() {
  const userRows = await loadRejected("users", "noah_kyc_status", "noah_kyc_rejection_reasons")
  const bizRows = await loadRejected("businesses", "noah_kyb_status", "noah_kyb_rejection_reasons")

  const patches = []
  for (const row of userRows) {
    const p = planPatch("users", row, "noah_kyc_rejection_reasons", "noah_kyc_status")
    if (p) patches.push(p)
  }
  for (const row of bizRows) {
    const p = planPatch("businesses", row, "noah_kyb_rejection_reasons", "noah_kyb_status")
    if (p) patches.push(p)
  }

  if (!patches.length) {
    console.log("No rejection rows need backfill.")
    return
  }

  console.log(`${patches.length} row(s) to update:`)
  for (const p of patches) {
    console.log(`  ${p.table} ${p.id} — ${p.note}`)
  }

  if (!execute) {
    console.log("\nDry run. Re-run with --execute to apply.")
    return
  }

  let ok = 0
  let fail = 0
  for (const p of patches) {
    const { error } = await admin
      .from(p.table)
      .update({ [p.column]: p.next, updated_at: new Date().toISOString() })
      .eq("id", p.id)
    if (error) {
      console.error(`  fail ${p.table} ${p.id}:`, error.message)
      fail++
    } else {
      ok++
    }
  }
  console.log(`Done. Updated ${ok}, failed ${fail}.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
