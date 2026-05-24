/**
 * List Noah production sell corridors + working /prices pairs for this API key.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/probe-noah-pairs.ts
 *
 * Writes `docs/noah-payout-manifest.json` when PROBE_WRITE_MANIFEST=true.
 */

import { writeFileSync } from "fs"
import { join } from "path"
import { noahFetch, NoahHttpError } from "../lib/noah/http"
import { fetchSellChannelItems } from "../lib/noah/payout-prepare"
import { normalizeFormSchemaHints, pickChannelForRail } from "../lib/noah/form-schema-hints"
import { getNoahSettlementCryptoCurrency, getNoahUsdCryptoTicker, getNoahEurCryptoTicker } from "../lib/noah/config"

function errMsg(e: unknown): string {
  if (e instanceof NoahHttpError) return `${e.status}: ${e.message.slice(0, 100)}`
  return e instanceof Error ? e.message.slice(0, 100) : String(e)
}

type PriceItem = {
  DestinationAmount?: string
  SourceAmount?: string
  Rate?: string
  PaymentMethodCategory?: string
  TotalFee?: string
}

function pickPrice(data: Record<string, unknown>): PriceItem | null {
  const items = data.Items as PriceItem[] | undefined
  if (items?.length) return items[0] ?? null
  if (data.DestinationAmount != null) return data as PriceItem
  return null
}

async function tryPrices(
  source: string,
  dest: string,
  country?: string,
): Promise<{ ok: boolean; rate?: number; fee?: string; rail?: string; err?: string }> {
  try {
    const query: Record<string, string> = {
      SourceCurrency: source,
      DestinationCurrency: dest,
      SourceAmount: "100",
    }
    if (country) query.Country = country
    const data = await noahFetch<Record<string, unknown>>({ method: "GET", path: "/prices", query })
    const row = pickPrice(data)
    const d = Number(row?.DestinationAmount)
    const s = Number(row?.SourceAmount ?? 100)
    if (!Number.isFinite(d) || d <= 0) return { ok: false, err: "no destination" }
    return {
      ok: true,
      rate: d / s,
      fee: row?.TotalFee,
      rail: row?.PaymentMethodCategory,
    }
  } catch (e) {
    return { ok: false, err: errMsg(e) }
  }
}

async function main() {
  const usdc = getNoahUsdCryptoTicker()
  const eurc = getNoahEurCryptoTicker()
  const settlement = getNoahSettlementCryptoCurrency()

  console.log("Production Noah probe")
  console.log("Settlement:", settlement, "| USDC:", usdc, "| EURC:", eurc)
  console.log("---\n")

  const countriesMap = await noahFetch<Record<string, string[]>>(
    { method: "GET", path: "/channels/sell/countries" },
  )

  const corridors: Array<{ country: string; fiats: string[] }> = []
  for (const [country, fiats] of Object.entries(countriesMap)) {
    if (!Array.isArray(fiats)) continue
    corridors.push({ country, fiats: [...new Set(fiats.map((f) => f.toUpperCase()))] })
  }
  corridors.sort((a, b) => a.country.localeCompare(b.country))

  console.log(`=== SELL COUNTRIES CATALOG (${corridors.length} countries) ===`)
  const allFiats = new Set<string>()
  for (const c of corridors) {
    for (const f of c.fiats) allFiats.add(f)
    console.log(`  ${c.country}: ${c.fiats.join(", ")}`)
  }
  console.log(`\nUnique fiats in catalog: ${[...allFiats].sort().join(", ")}\n`)

  console.log(`=== SELL CHANNELS (GET /channels/sell, crypto=${settlement}) ===`)
  const withChannels: Array<{ country: string; fiat: string; n: number; types: string[] }> = []
  for (const { country, fiats } of corridors) {
    for (const fiat of fiats) {
      try {
        const data = await noahFetch<{ Items?: Array<Record<string, unknown>> }>({
          method: "GET",
          path: "/channels/sell",
          query: { Country: country, FiatCurrency: fiat, CryptoCurrency: settlement },
        })
        const items = data.Items ?? []
        if (items.length === 0) continue
        const types = [
          ...new Set(items.map((x) => String(x.PaymentMethodCategory ?? "?"))),
        ]
        withChannels.push({ country, fiat, n: items.length, types })
      } catch {
        // skip
      }
    }
  }
  console.log(`${"CC".padEnd(4)} ${"Fiat".padEnd(4)} Ch  Rails`)
  for (const r of withChannels) {
    console.log(`${r.country.padEnd(4)} ${r.fiat.padEnd(4)} ${String(r.n).padStart(2)}  ${r.types.join(",")}`)
  }

  console.log(`\n=== /prices USDC → fiat (Country set per corridor) ===`)
  const pricesOk: Array<{ country: string; fiat: string; rate: number; fee?: string; rail?: string }> = []
  for (const { country, fiats } of corridors) {
    for (const fiat of fiats) {
      if (fiat === "USD" && country === "US") {
        // USDC→USD may need different handling
      }
      const dest = fiat === "EUR" ? eurc : fiat
      const r = await tryPrices(usdc, dest, country)
      if (r.ok && r.rate) {
        pricesOk.push({ country, fiat, rate: r.rate, fee: r.fee, rail: r.rail })
        console.log(
          `  ${country} ${fiat.padEnd(4)}  rate≈${r.rate.toFixed(2)}  fee=${r.fee ?? "?"}  ${r.rail ?? ""}`,
        )
      }
    }
  }

  console.log(`\n=== /prices EURC → fiat ===`)
  const eurcOk: string[] = []
  for (const { country, fiats } of corridors) {
    for (const fiat of fiats) {
      if (fiat === "EUR") continue
      const dest = fiat === "USD" ? usdc : fiat
      const r = await tryPrices(eurc, dest, country)
      if (r.ok) {
        eurcOk.push(`${country}:${fiat}`)
        console.log(`  ${country} ${fiat.padEnd(4)}  rate≈${r.rate?.toFixed(2)}`)
      }
    }
  }

  console.log(`\n=== SUMMARY ===`)
  console.log(`Countries in Noah sell catalog: ${corridors.length}`)
  console.log(`Unique fiats: ${[...allFiats].sort().join(", ")}`)
  console.log(`Corridors with sell channels (USDC): ${withChannels.length}`)
  console.log(`Corridors with working /prices (USDC): ${pricesOk.length}`)
  const pricedFiats = [...new Set(pricesOk.map((p) => p.fiat))].sort()
  console.log(`Fiats with /prices quote: ${pricedFiats.join(", ")}`)

  if (process.env.PROBE_WRITE_MANIFEST === "true") {
    const manifest: Array<Record<string, unknown>> = []
    for (const { country, fiats } of corridors) {
      for (const fiat of fiats) {
        try {
          const items = await fetchSellChannelItems({
            country,
            fiatCurrency: fiat,
            cryptoCurrency: settlement,
          })
          if (items.length === 0) continue
          for (const rail of ["bank_transfer", "mobile_money"] as const) {
            const pick = pickChannelForRail(items, rail)
            if (!pick) continue
            manifest.push({
              country_code: country,
              fiat_currency: fiat,
              rail,
              channel_count: items.length,
              payment_method_type: pick.PaymentMethodType,
              payment_method_category: pick.PaymentMethodCategory,
              fields_schema: normalizeFormSchemaHints(pick),
            })
          }
        } catch {
          // skip pair
        }
      }
    }
    const payload = JSON.stringify(
      { generated_at: new Date().toISOString(), corridors: manifest },
      null,
      2,
    )
    const docsPath = join(process.cwd(), "..", "docs", "noah-payout-manifest.json")
    const scriptsDataPath = join(
      process.cwd(),
      "data",
      "noah-global-payout-manifest.json",
    )
    writeFileSync(docsPath, payload)
    writeFileSync(scriptsDataPath, payload)
    console.log(`\nWrote manifest (${manifest.length} rows) → ${docsPath}`)
    console.log(`Also wrote → ${scriptsDataPath}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
