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

const businessId = process.argv[2] ?? "fd9c4c9a-a8c8-4019-9475-eb7317894f43"
const runSync = process.argv.includes("--sync")

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { syncGridBusinessKybToSupabase } = await import("../lib/grid/sync-kyb.ts")
  const { provisionAfterVerificationApproved } = await import(
    "../lib/verification/provision-after-approval.ts"
  )

  const { data: biz } = await admin
    .from("businesses")
    .select("id,name,grid_customer_id,verification_status,kyb_verified_at")
    .eq("id", businessId)
    .single()

  if (!biz?.grid_customer_id) {
    console.error("No grid_customer_id on business")
    process.exit(1)
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
    console.log("Pass --sync to pull Grid KYB and provision")
    return
  }

  const userId = owner?.id ?? businessId
  const { status } = await syncGridBusinessKybToSupabase({
    admin,
    businessId,
    userId,
    customerId: String(biz.grid_customer_id),
  })
  console.log("sync_status", status)

  if (status === "approved") {
    const provisioned = await provisionAfterVerificationApproved({
      admin,
      scope: "business",
      subjectUserId: userId,
      subjectBusinessId: businessId,
      partnerCustomerId: String(biz.grid_customer_id),
      provider: "grid",
    })
    console.log("provisioned", provisioned)
  }

  const { data: after } = await admin
    .from("businesses")
    .select("verification_status,kyb_verified_at,name,registration_number")
    .eq("id", businessId)
    .single()
  console.log("after", after)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
