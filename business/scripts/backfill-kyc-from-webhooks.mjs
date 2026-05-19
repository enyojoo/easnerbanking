#!/usr/bin/env node
/**
 * Lists approved individual users missing KYC columns; with --execute, syncs each from Noah.
 *
 * Usage:
 *   node business/scripts/backfill-kyc-from-webhooks.mjs
 *   node business/scripts/backfill-kyc-from-webhooks.mjs --execute
 *   node business/scripts/backfill-kyc-from-webhooks.mjs --from-webhooks   # replay stored Customer webhooks (no Noah API)
 *   node business/scripts/backfill-kyc-from-webhooks.mjs --from-webhooks --force   # re-sync all approved (e.g. fix full_name)
 */
import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dir = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dir, "../.env.local") })

const execute = process.argv.includes("--execute")
const fromWebhooks = process.argv.includes("--from-webhooks")
const force = process.argv.includes("--force")

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in business/.env.local")
  process.exit(1)
}

const admin = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  const { data: users, error } = await admin
    .from("users")
    .select("id,email,noah_customer_id,noah_kyc_status,kyc_verified_at,kyc_id_type,full_name")
    .eq("noah_kyc_status", "approved")
  if (error) throw error

  const needs = force
    ? (users ?? [])
    : (users ?? []).filter((u) => !u.kyc_verified_at || !u.kyc_id_type)
  if (!needs.length) {
    console.log(
      force
        ? "No approved users to sync."
        : "All approved users already have kyc_verified_at / kyc_id_type.",
    )
    return
  }

  if (!execute && !fromWebhooks) {
    console.log(
      `${needs.length} user(s) need KYC backfill. Re-run with --from-webhooks or --execute:`,
    )
    for (const u of needs) {
      console.log(`  ${u.id}  (${u.email ?? u.noah_customer_id})`)
    }
    return
  }

  if (fromWebhooks) {
    const { syncNoahCustomerToSupabase } = await import("../lib/noah/sync-user.ts")
    const { mapNoahVerificationToKycStatus } = await import("../lib/noah/map-kyc.ts")
    console.log(`Backfilling KYC columns from stored Customer webhooks (${needs.length} user(s))…`)
    let ok = 0
    let fail = 0
    for (const u of needs) {
      const label = u.email ?? u.noah_customer_id ?? u.id
      const cid = (u.noah_customer_id ?? "").trim()
      if (!cid) {
        console.error(`  fail  ${label}: missing noah_customer_id`)
        fail++
        continue
      }
      try {
        const { data: rows, error: whErr } = await admin
          .from("webhook_deliveries")
          .select("payload,received_at")
          .eq("noah_customer_id", cid)
          .eq("event_type", "Customer")
          .order("received_at", { ascending: false })
          .limit(1)
        if (whErr) throw whErr
        const p = rows?.[0]?.payload
        if (!p || typeof p !== "object") throw new Error("no Customer webhook in webhook_deliveries")
        const data = p.Data
        if (!data || typeof data !== "object") throw new Error("webhook payload missing Data")
        const occurredAt =
          p.Occurred != null
            ? String(p.Occurred)
            : data.Occurred != null
              ? String(data.Occurred)
              : undefined
        const customerLike = {
          ...data,
          Verifications: data.Verifications,
          Occurred: occurredAt ?? data.Occurred,
        }
        if (mapNoahVerificationToKycStatus(customerLike) !== "approved") {
          throw new Error("latest Customer webhook is not approved")
        }
        await syncNoahCustomerToSupabase(
          { kind: "individual", userId: u.id },
          customerLike,
          cid,
          { occurredAt },
        )
        const { data: after } = await admin
          .from("users")
          .select("kyc_verified_at,kyc_id_type")
          .eq("id", u.id)
          .single()
        if (!after?.kyc_verified_at || !after?.kyc_id_type) {
          throw new Error("sync ran but kyc_verified_at / kyc_id_type still empty")
        }
        const { data: profile } = await admin.from("users").select("full_name").eq("id", u.id).single()
        console.log(`  ok  ${label}  → full_name: ${profile?.full_name ?? "(empty)"}`)
        ok++
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`  fail  ${label}: ${msg}`)
        fail++
      }
    }
    console.log(`Done: ${ok} synced, ${fail} failed.`)
    if (fail) process.exit(1)
    return
  }

  const { fetchNoahCustomerWithIndividualFallback } = await import("../lib/noah/fetch-customer.ts")
  const { syncNoahCustomerToSupabase } = await import("../lib/noah/sync-user.ts")

  console.log(`Syncing ${needs.length} user(s) from Noah API…`)
  let ok = 0
  let fail = 0
  for (const u of needs) {
    const label = u.email ?? u.noah_customer_id ?? u.id
    try {
      const primary = (u.noah_customer_id ?? u.id).trim()
      const { customer, resolvedCustomerId } = await fetchNoahCustomerWithIndividualFallback(
        u.id,
        primary,
      )
      await syncNoahCustomerToSupabase(
        { kind: "individual", userId: u.id },
        customer,
        resolvedCustomerId,
      )
      console.log(`  ok  ${label}`)
      ok++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`  fail  ${label}: ${msg}`)
      fail++
    }
  }
  console.log(`Done: ${ok} synced, ${fail} failed.`)
  if (fail) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
