/**
 * Probe Noah sell channels for Nigeria (NG / NGN).
 * Usage: cd business && npx tsx scripts/probe-ng-sell.ts
 */
import { config } from "dotenv"
config({ path: ".env.local" })

import { noahFetch } from "../lib/noah/http"

async function probe(label: string, query: Record<string, string>) {
  try {
    const data = await noahFetch<{ Items?: Array<Record<string, unknown>> }>({
      method: "GET",
      path: "/channels/sell",
      query,
    })
    const items = data.Items ?? []
    console.log(
      label,
      "count=",
      items.length,
      items.slice(0, 3).map((x) => ({
        cat: x.PaymentMethodCategory,
        type: x.PaymentMethodType,
        country: x.Country,
        fiat: x.FiatCurrency,
      })),
    )
    return items
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(label, "ERR", msg.slice(0, 150))
    return []
  }
}

async function main() {
  for (const c of ["USDC", "EURC"]) {
    await probe(`NG+NGN crypto=${c}`, { Country: "NG", FiatCurrency: "NGN", CryptoCurrency: c })
  }
  await probe("NGN+USDC no country", { FiatCurrency: "NGN", CryptoCurrency: "USDC" })
  const all = await probe("USDC only", { CryptoCurrency: "USDC" })
  const ng = all.filter(
    (x) =>
      String(x.Country || "").toUpperCase() === "NG" ||
      String(x.FiatCurrency || "").toUpperCase() === "NGN",
  )
  console.log("\nNG/NGN in USDC-only response:", ng.length)
  for (const x of ng) {
    console.log(" ", x.PaymentMethodCategory, x.PaymentMethodType, x.Country, x.FiatCurrency, x.ID)
  }

  const prices = await noahFetch<Record<string, unknown>>({
    method: "GET",
    path: "/prices",
    query: { SourceCurrency: "USDC", DestinationCurrency: "NGN", SourceAmount: "100", Country: "NG" },
  })
  const items = prices.Items as Array<Record<string, unknown>> | undefined
  console.log("\n/prices USDC→NGN Country=NG:", items?.[0] ?? prices)
}

void main()
