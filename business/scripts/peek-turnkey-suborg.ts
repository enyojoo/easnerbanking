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

import { getTurnkeyApiClient } from "@/lib/turnkey/client"

const subOrg = process.argv[2] ?? "4daf7b5f-2adb-46a3-8296-acf259dd9a67"

async function main() {
  const client = getTurnkeyApiClient()
  if (!client) {
    console.log("Turnkey not configured")
    return
  }

  const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(client))
    .filter((m) => m !== "constructor" && !m.startsWith("_"))
    .sort()
  console.log("client methods:", proto.filter((m) => /user|org|sub/i.test(m)).join(", "))

  const attempts: Array<{ label: string; fn: () => Promise<unknown> }> = []

  if (typeof (client as { getUsers?: unknown }).getUsers === "function") {
    attempts.push({
      label: "getUsers",
      fn: () => (client as { getUsers: (p: { organizationId: string }) => Promise<unknown> }).getUsers({ organizationId: subOrg }),
    })
  }
  if (typeof (client as { getOrganization?: unknown }).getOrganization === "function") {
    attempts.push({
      label: "getOrganization",
      fn: () =>
        (client as { getOrganization: (p: { organizationId: string }) => Promise<unknown> }).getOrganization({
          organizationId: subOrg,
        }),
    })
  }
  if (typeof (client as { getSubOrgIds?: unknown }).getSubOrgIds === "function") {
    attempts.push({
      label: "getSubOrgIds",
      fn: () => (client as { getSubOrgIds: (p: Record<string, never>) => Promise<unknown> }).getSubOrgIds({}),
    })
  }

  for (const a of attempts) {
    try {
      const res = await a.fn()
      console.log(`\n--- ${a.label} ok ---`)
      console.log(JSON.stringify(res, null, 2))
    } catch (e) {
      console.log(`\n--- ${a.label} error ---`, e instanceof Error ? e.message : e)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
