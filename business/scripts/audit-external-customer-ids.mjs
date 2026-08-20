#!/usr/bin/env node
/**
 * Audit Grid business handles: canonical eb_ vs stored Customer: id.
 *
 *   node scripts/audit-external-customer-ids.mjs
 *   node scripts/audit-external-customer-ids.mjs <business-uuid>
 *   node scripts/audit-external-customer-ids.mjs --backfill-grid-customer-id [--apply]
 */
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { ebFromBusinessId } from "@easner/shared"

const __dir = dirname(fileURLToPath(import.meta.url))

function loadEnvLocal() {
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
}

loadEnvLocal()

const args = process.argv.slice(2)
const businessFilter = args.find((a) => !a.startsWith("--")) ?? null
const backfill = args.includes("--backfill-grid-customer-id")
const apply = args.includes("--apply")

async function gridFetchJson(path) {
  const { gridFetch } = await import("../lib/grid/http.ts")
  return gridFetch({ method: "GET", path })
}

async function maybeBackfillBusiness(admin, business) {
  if (!backfill || business.grid_customer_id?.trim()) return null
  const platformCustomerId = ebFromBusinessId(business.id)
  try {
    const res = await gridFetchJson(
      `/customers?${new URLSearchParams({ platformCustomerId }).toString()}`,
    )
    const hit = (res?.data ?? [])[0]
    if (!hit?.id) {
      return { businessId: business.id, action: "no_grid_match", platformCustomerId }
    }
    const customerId = String(hit.id)
    if (apply) {
      await admin
        .from("businesses")
        .update({ grid_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq("id", business.id)
    }
    return { businessId: business.id, action: apply ? "backfilled" : "would_backfill", customerId }
  } catch (e) {
    return {
      businessId: business.id,
      action: "grid_error",
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  let bizQuery = admin
    .from("businesses")
    .select(
      "id,name,external_customer_id,grid_customer_id,verification_provider,verification_status",
    )
  if (businessFilter) bizQuery = bizQuery.eq("id", businessFilter)

  const { data: businesses, error: bizErr } = await bizQuery
  if (bizErr) {
    console.error("businesses query failed", bizErr)
    process.exit(1)
  }

  for (const b of businesses ?? []) {
    const expected = ebFromBusinessId(b.id)
    const issues = []
    if (b.external_customer_id && b.external_customer_id !== expected) {
      issues.push("external_customer_id drift")
    }
    if (!b.grid_customer_id?.trim()) {
      issues.push(
        b.verification_status === "approved"
          ? "missing grid_customer_id (approved)"
          : "missing grid_customer_id",
      )
    }
    const backfillResult = await maybeBackfillBusiness(admin, b)
    console.log(
      JSON.stringify(
        {
          businessId: b.id,
          name: b.name,
          external_customer_id: b.external_customer_id ?? expected,
          grid_customer_id: b.grid_customer_id,
          verification_status: b.verification_status,
          issues,
          backfill: backfillResult,
        },
        null,
        2,
      ),
    )
  }

  if (backfill && !apply) {
    console.log("\n(dry-run – pass --apply to persist grid_customer_id)")
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
