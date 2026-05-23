/**
 * List sendable vs quote-only vs catalog-only corridors for this API key.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/list-noah-blocked-corridors.ts
 */

import { noahFetch } from "../lib/noah/http"
import { getNoahSettlementCryptoCurrency, getNoahUsdCryptoTicker } from "../lib/noah/config"

async function main() {
  const settlement = getNoahSettlementCryptoCurrency()
  const usdc = getNoahUsdCryptoTicker()

  const countriesMap = await noahFetch<Record<string, string[]>>({
    method: "GET",
    path: "/channels/sell/countries",
  })

  const sendable = new Set<string>()
  for (const [country, fiats] of Object.entries(countriesMap)) {
    if (!Array.isArray(fiats)) continue
    for (const fiat of fiats) {
      try {
        const data = await noahFetch<{ Items?: unknown[] }>({
          method: "GET",
          path: "/channels/sell",
          query: { Country: country, FiatCurrency: fiat, CryptoCurrency: settlement },
        })
        if ((data.Items ?? []).length > 0) {
          sendable.add(`${country}:${fiat.toUpperCase()}`)
        }
      } catch {
        // skip
      }
    }
  }

  const quoteOnly: string[] = []
  const catalogOnly: string[] = []
  const allCatalog: string[] = []

  for (const [country, fiats] of Object.entries(countriesMap)) {
    if (!Array.isArray(fiats)) continue
    for (const fiat of [...new Set(fiats.map((f) => f.toUpperCase()))]) {
      const key = `${country}:${fiat}`
      allCatalog.push(key)
      if (sendable.has(key)) continue

      try {
        const dest = fiat === "EUR" ? fiat : fiat
        const data = await noahFetch<Record<string, unknown>>({
          method: "GET",
          path: "/prices",
          query: {
            SourceCurrency: usdc,
            DestinationCurrency: dest,
            SourceAmount: "100",
            Country: country,
          },
        })
        const items = data.Items as Array<Record<string, unknown>> | undefined
        const row = items?.[0]
        if (row?.DestinationAmount != null) {
          const rail = String(row.PaymentMethodCategory ?? "?")
          quoteOnly.push(`${country} ${fiat} (${rail})`)
        } else {
          catalogOnly.push(`${country} ${fiat}`)
        }
      } catch {
        catalogOnly.push(`${country} ${fiat}`)
      }
    }
  }

  console.log("=== SENDABLE (GET /channels/sell returns Items) ===")
  console.log([...sendable].sort().join("\n"))
  console.log(`\nTotal sendable pairs: ${sendable.size}\n`)

  console.log("=== BLOCKED: quote-only (/prices works, no sell channel) ===")
  quoteOnly.sort().forEach((l) => console.log(" ", l))
  console.log(`\nTotal quote-only: ${quoteOnly.length}\n`)

  console.log("=== BLOCKED: catalog only (no sell channel, no /prices in probe) ===")
  catalogOnly.sort().forEach((l) => console.log(" ", l))
  console.log(`\nTotal catalog-only: ${catalogOnly.length}`)
}

void main()
