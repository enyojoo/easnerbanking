#!/usr/bin/env npx tsx
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

async function main() {
  const admin = createSupabaseAdmin()
  const { data: rows, error } = await admin.from("users").select("id,email,role,easner_business_id")
  if (error) throw new Error(error.message)

  const all = rows ?? []
  const badLinkNoBizRole = all.filter((r) => r.easner_business_id && r.role !== "business")
  const badBizRoleNoLink = all.filter((r) => r.role === "business" && !r.easner_business_id)
  const nullRole = all.filter((r) => !r.role)
  const otherRoles = all.filter((r) => r.role && r.role !== "business" && r.role !== "individual")

  console.log("total users", all.length)
  console.log("linked org but role != business", badLinkNoBizRole.length)
  console.log("role=business but no org link", badBizRoleNoLink.length)
  console.log("null role", nullRole.length)
  console.log("other roles", otherRoles.length)
  if (badLinkNoBizRole.length) console.log("samples badLinkNoBizRole", badLinkNoBizRole.slice(0, 5))
  if (badBizRoleNoLink.length) console.log("samples badBizRoleNoLink", badBizRoleNoLink.slice(0, 5))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
