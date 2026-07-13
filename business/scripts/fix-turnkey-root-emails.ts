#!/usr/bin/env npx tsx
/**
 * Fix Turnkey root user emails on linked sub-orgs (read-only unless --execute).
 *
 * Order: individual first (frees hello@ on ddd0463d), then business KYB.
 *
 * Usage:
 *   cd business
 *   npx tsx scripts/fix-turnkey-root-emails.ts
 *   npx tsx scripts/fix-turnkey-root-emails.ts --execute
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

import { getTurnkeyApiClient } from "@/lib/turnkey/client"

const FIXES = [
  {
    label: "Individual KYC (c7ace38e)",
    organizationId: "ddd0463d-c476-4b5d-8789-ded021e4b549",
    userId: "2ae020b6-392e-4e8f-b6a9-e0c86a26f5a1",
    fromEmail: "hello@easner.com",
    toEmail: "enyocreative@gmail.com",
  },
  {
    label: "Business KYB (Easner Group)",
    organizationId: "4daf7b5f-2adb-46a3-8296-acf259dd9a67",
    userId: "490768fa-3125-4b2c-9240-3d716dcce087",
    fromEmail: "enyo@easner.com",
    toEmail: "hello@easner.com",
  },
] as const

async function getHumanRootEmail(
  client: NonNullable<ReturnType<typeof getTurnkeyApiClient>>,
  organizationId: string,
  userId: string,
): Promise<string | undefined> {
  const res = await client.getUsers({ organizationId })
  const user = (res.users ?? []).find((u) => u.userId === userId)
  return user?.userEmail?.trim().toLowerCase() || undefined
}

async function main() {
  const execute = process.argv.includes("--execute")
  const client = getTurnkeyApiClient()
  if (!client) throw new Error("Turnkey not configured")

  console.log(execute ? "EXECUTE mode" : "DRY RUN (pass --execute to apply)")
  console.log()

  for (const fix of FIXES) {
    console.log("—".repeat(60))
    console.log(fix.label)
    console.log(`  sub-org: ${fix.organizationId}`)
    console.log(`  userId:  ${fix.userId}`)
    console.log(`  email:   ${fix.fromEmail} → ${fix.toEmail}`)

    const current = await getHumanRootEmail(client, fix.organizationId, fix.userId)
    console.log(`  current: ${current ?? "(none)"}`)

    if (current === fix.toEmail.toLowerCase()) {
      console.log("  skip: already correct")
      continue
    }
    if (current && current !== fix.fromEmail.toLowerCase()) {
      console.warn(`  warn: expected ${fix.fromEmail} but found ${current}`)
    }

    if (!execute) {
      console.log("  would call updateUserEmail")
      continue
    }

    const result = await client.updateUserEmail({
      organizationId: fix.organizationId,
      userId: fix.userId,
      userEmail: fix.toEmail,
    })
    console.log("  updateUserEmail activity:", {
      activityId: (result as { activity?: { id?: string } }).activity?.id,
      status: (result as { activity?: { status?: string } }).activity?.status,
    })

    const after = await getHumanRootEmail(client, fix.organizationId, fix.userId)
    console.log(`  after:   ${after ?? "(none)"}`)
    if (after !== fix.toEmail.toLowerCase()) {
      throw new Error(`Email update did not stick for ${fix.label}`)
    }
    console.log("  ok")
  }

  console.log("\nDone.")
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
