#!/usr/bin/env npx tsx
/**
 * Repairs users with easner_business_id but role !== business (pre-migration drift / emergency).
 * After `20260812143000_users_role_business_linkage.sql` is applied, Postgres rejects bad rows.
 *
 * Usage:
 *   npx tsx scripts/repair-business-role-linkage.ts
 *   npx tsx scripts/repair-business-role-linkage.ts user@email
 */
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

function loadEnvLocal() {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), "../.env.local")
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
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
    if (process.env[key] == null) process.env[key] = value
  }
}

loadEnvLocal()

import { createSupabaseAdmin } from "@/lib/supabase/admin"

const emailFilter = process.argv[2]?.trim().toLowerCase()

async function main() {
  const admin = createSupabaseAdmin()

  let query = admin
    .from("users")
    .select("id,email,full_name,role,easner_business_id")
    .not("easner_business_id", "is", null)
    .neq("role", "business")

  if (emailFilter) {
    query = query.ilike("email", emailFilter)
  }

  const { data: rows, error } = await query
  if (error) throw new Error(error.message)

  if (!rows?.length) {
    console.log(emailFilter ? `No inconsistent users for ${emailFilter}` : "No inconsistent users found")
    return
  }

  console.log(`Found ${rows.length} user(s) with business link but role !== business`)

  for (const row of rows) {
    const userId = String(row.id)
    const businessId = String(row.easner_business_id)
    const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : ""

    const { data: authData } = await admin.auth.admin.getUserById(userId)
    const authName =
      typeof authData.user?.user_metadata?.name === "string"
        ? authData.user.user_metadata.name.trim()
        : ""
    const fullName =
      (typeof row.full_name === "string" && row.full_name.trim()) || authName || "Account Owner"

    console.log(`\nRepairing ${email || userId}...`)

    const { error: roleErr } = await admin
      .from("users")
      .update({
        role: "business",
        full_name: fullName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)

    if (roleErr) {
      console.error(`  FAILED role update: ${roleErr.message}`)
      continue
    }
    console.log(`  role -> business, full_name -> ${fullName}`)

    if (email) {
      const { error: memberErr } = await admin.from("business_memberships").upsert(
        {
          business_id: businessId,
          user_id: userId,
          full_name: fullName,
          email,
          role: "owner",
          status: "active",
          invited_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "business_id,email" },
      )
      if (memberErr) {
        console.warn(`  membership upsert warning: ${memberErr.message}`)
      } else {
        console.log(`  owner membership ensured for business ${businessId}`)
      }
    }

    const { data: verify } = await admin
      .from("users")
      .select("id,email,full_name,role,easner_business_id")
      .eq("id", userId)
      .maybeSingle()
    console.log("  verified:", verify)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
