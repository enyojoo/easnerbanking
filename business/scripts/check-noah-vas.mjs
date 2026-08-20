#!/usr/bin/env node
/**
 * Production Noah VA diagnostic – customers + PayinTo payment methods.
 * Usage: node business/scripts/check-noah-vas.mjs [CustomerID ...]
 */
import { config } from "dotenv"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dir = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dir, "../.env.local") })

const { noahFetch } = await import("../lib/noah/http.ts")
const { mapNoahVerificationToKycStatus } = await import("../lib/noah/map-kyc.ts")
const { hasPayinBank, matchesCurrency } = await import("../lib/noah/payment-method-map.ts")

const defaultIds = [
  { label: "mobile-individual", id: "eind_c7ace38ebe3843e786e16e66b90d4243" },
  { label: "business", id: "ebiz_4769329da17149cf86477e9b8a0128d3" },
]

const targets =
  process.argv.length > 2
    ? process.argv.slice(2).map((id) => ({ label: id, id }))
    : defaultIds

async function listPm(customerId, capability) {
  const query = { CustomerID: customerId, PageSize: 50 }
  if (capability) query.Capability = capability
  const data = await noahFetch({
    method: "GET",
    path: "/payment-methods",
    query,
  })
  return data.Items ?? []
}

for (const c of targets) {
  console.log(`\n=== ${c.label} (${c.id}) ===`)
  try {
    const customer = await noahFetch({
      method: "GET",
      path: `/customers/${encodeURIComponent(c.id)}`,
    })
    const kyc = mapNoahVerificationToKycStatus(customer)
    console.log("customer: OK", "Type:", customer.Type, "kyc:", kyc)
    const ver = customer.Verifications
    if (ver?.EntityVerifications && Array.isArray(ver.EntityVerifications)) {
      for (const e of ver.EntityVerifications) {
        console.log("  entity:", e.Entity, "status:", e.Status)
      }
    }
  } catch (e) {
    const status = e?.status ?? ""
    const msg = e instanceof Error ? e.message : String(e)
    console.log("customer: FAIL", status, msg.slice(0, 120))
  }

  for (const cap of ["PayinTo", null]) {
    const label = cap ?? "all"
    try {
      const items = await listPm(c.id, cap)
      console.log(`payment-methods (${label}):`, items.length)
      let usd = 0
      let eur = 0
      for (const pm of items) {
        if (hasPayinBank(pm, "US") || matchesCurrency(pm, "usd")) usd++
        if (matchesCurrency(pm, "eur")) eur++
        const dd = pm.DisplayDetails
        console.log(
          "  -",
          String(pm.ID ?? "").slice(0, 20),
          "country:",
          pm.Country ?? "-",
          "fiat:",
          pm.FiatCurrency ?? "-",
          "entity:",
          pm.Entity ?? "-",
          "display:",
          dd?.Type ?? "-",
        )
      }
      console.log(`  => deposit rails: USD ${usd}, EUR ${eur}`)
    } catch (e) {
      const status = e?.status ?? ""
      const msg = e instanceof Error ? e.message : String(e)
      console.log(`payment-methods (${label}): FAIL`, status, msg.slice(0, 80))
    }
  }
}
