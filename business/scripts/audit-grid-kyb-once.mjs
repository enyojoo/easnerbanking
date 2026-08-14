#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

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
const runSync = args.includes("--sync")
const runBatch = args.includes("--batch")
const businessIdArg = args.find((a) => !a.startsWith("--"))

async function syncOneBusiness(admin, syncGridBusinessKybToSupabase, provisionAfterVerificationApproved, businessId) {
  const { data: biz } = await admin
    .from("businesses")
    .select("id,name,grid_customer_id,verification_status,kyb_verified_at")
    .eq("id", businessId)
    .single()

  if (!biz?.grid_customer_id) {
    console.warn(`skip ${businessId}: no grid_customer_id`)
    return { businessId, skipped: true }
  }

  const { data: owner } = await admin
    .from("users")
    .select("id,email")
    .eq("easner_business_id", businessId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  console.log("before", biz)

  if (!runSync) {
    return { businessId, dryRun: true }
  }

  const userId = owner?.id ?? businessId
  const { status } = await syncGridBusinessKybToSupabase({
    admin,
    businessId,
    userId,
    customerId: String(biz.grid_customer_id),
  })
  console.log("sync_status", businessId, status)

  if (status === "approved") {
    const provisioned = await provisionAfterVerificationApproved({
      admin,
      scope: "business",
      subjectUserId: userId,
      subjectBusinessId: businessId,
      partnerCustomerId: String(biz.grid_customer_id),
      provider: "grid",
    })
    console.log("provisioned", businessId, provisioned)
  }

  const { data: after } = await admin
    .from("businesses")
    .select("verification_status,kyb_verified_at,name,registration_number")
    .eq("id", businessId)
    .single()
  console.log("after_business", businessId, after)

  return { businessId, status, after }
}

async function listBatchBusinessIds(admin) {
  const { data, error } = await admin
    .from("businesses")
    .select("id")
    .eq("verification_provider", "grid")
    .eq("verification_status", "pending")
    .is("kyb_verified_at", null)
    .not("grid_customer_id", "is", null)

  if (error) throw error
  return (data ?? []).map((row) => String(row.id))
}

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  if (runBatch) {
    const ids = await listBatchBusinessIds(admin)
    console.log(`batch: ${ids.length} businesses`)
    if (!runSync) {
      console.log("Pass --sync to re-sync all affected businesses")
      for (const id of ids) console.log(id)
      return
    }
  }

  const { syncGridBusinessKybToSupabase } = await import("../lib/grid/sync-kyb.ts")
  const { provisionAfterVerificationApproved } = await import(
    "../lib/verification/provision-after-approval.ts"
  )

  if (runBatch) {
    const ids = await listBatchBusinessIds(admin)
    const BATCH = 20
    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH)
      for (const id of slice) {
        await syncOneBusiness(
          admin,
          syncGridBusinessKybToSupabase,
          provisionAfterVerificationApproved,
          id,
        )
      }
      if (i + BATCH < ids.length) {
        await new Promise((r) => setTimeout(r, 1000))
      }
    }
    return
  }

  const businessId = businessIdArg ?? "fd9c4c9a-a8c8-4019-9475-eb7317894f43"
  if (!runSync) {
    await syncOneBusiness(admin, syncGridBusinessKybToSupabase, provisionAfterVerificationApproved, businessId)
    console.log("Pass --sync to pull Grid KYB and provision")
    return
  }

  await syncOneBusiness(admin, syncGridBusinessKybToSupabase, provisionAfterVerificationApproved, businessId)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
