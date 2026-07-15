/**
 * Inspect Noah GET /customers/:id shape (redacts ID numbers in output).
 * Usage: node --env-file=.env.local --import tsx scripts/peek-noah-customer-shape.ts [CustomerID...]
 */
import { getNoahBaseUrl, getNoahApiKey } from "../lib/noah/config"
import { noahFetch } from "../lib/noah/http"

function redactCustomer(c: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(c)) as Record<string, unknown>
  const redactIdentities = (ids: unknown) => {
    if (!Array.isArray(ids)) return ids
    return ids.map((id) => {
      if (!id || typeof id !== "object") return id
      const o = { ...(id as Record<string, unknown>) }
      if (typeof o.IDNumber === "string") o.IDNumber = `${o.IDNumber.slice(0, 4)}•••`
      if (typeof o.idNumber === "string") o.idNumber = `${String(o.idNumber).slice(0, 4)}•••`
      return o
    })
  }
  clone.Identities = redactIdentities(clone.Identities)
  if (Array.isArray(clone.Associates)) {
    clone.Associates = clone.Associates.map((a: Record<string, unknown>) => ({
      ...a,
      Identities: redactIdentities(a.Identities),
    }))
  }
  return clone
}

async function inspect(id: string) {
  const c = await noahFetch<Record<string, unknown>>({
    method: "GET",
    path: `/customers/${encodeURIComponent(id)}`,
  })
  const keys = Object.keys(c).sort()
  console.log(`\n=== ${id} ===`)
  console.log("Type:", c.Type, "| Verifications.Status:", (c.Verifications as { Status?: string })?.Status)
  console.log("top-level keys:", keys.join(", "))
  console.log("Has top Identities:", Array.isArray(c.Identities) ? c.Identities.length : 0)
  console.log("Has Associates:", Array.isArray(c.Associates) ? c.Associates.length : 0)
  console.log("Entity TaxID:", c.TaxID ?? null)
  if (Array.isArray(c.Associates)) {
    for (const [i, a] of c.Associates.entries()) {
      const row = a as Record<string, unknown>
      console.log(`  Associate[${i}] RelationshipTypes:`, row.RelationshipTypes)
      console.log(`  Associate[${i}] Identities count:`, Array.isArray(row.Identities) ? row.Identities.length : 0)
    }
  }
  console.log(JSON.stringify(redactCustomer(c), null, 2))
}

async function main() {
  const key = getNoahApiKey()
  console.log("NOAH base:", getNoahBaseUrl())
  console.log(
    "NOAH key:",
    key.includes("_prod_") ? "production (apikey_prod_…)" : key ? "non-prod or unknown" : "missing",
  )

  const ids =
    process.argv.slice(2).length > 0
      ? process.argv.slice(2)
      : [
          "ebiz_4769329da17149cf86477e9b8a0128d3",
          "eind_c7ace38ebe3843e786e16e66b90d4243",
        ]

  for (const id of ids) {
    await inspect(id.trim())
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
