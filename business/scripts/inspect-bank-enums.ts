/**
 * Print bank_enum counts from Noah sell channels (after form-schema-hints fix).
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/inspect-bank-enums.ts
 */
import { noahFetch } from "../lib/noah/http"
import { fetchSellChannelItems, getNoahSettlementCryptoCurrency } from "../lib/noah/payout-prepare"
import { normalizeFormSchemaHints, pickChannelForRail } from "../lib/noah/form-schema-hints"

async function main() {
  const settlement = getNoahSettlementCryptoCurrency()
  const countriesMap = await noahFetch<Record<string, string[]>>({
    method: "GET",
    path: "/channels/sell/countries",
  })

  let withBanks = 0
  let withoutBanks = 0
  const samples: string[] = []

  for (const [country, fiats] of Object.entries(countriesMap)) {
    const cc = country.toUpperCase()
    for (const fiat of [...new Set(fiats.map((f) => f.toUpperCase()))]) {
      let items
      try {
        items = await fetchSellChannelItems({
          country: cc,
          fiatCurrency: fiat,
          cryptoCurrency: settlement,
        })
      } catch {
        continue
      }
      const pick = pickChannelForRail(items, "bank_transfer")
      if (!pick?.FormSchema) continue
      const hints = normalizeFormSchemaHints(pick)
      const banks = hints.bank_enum ?? []
      if (banks.length > 0) {
        withBanks++
        if (samples.length < 8) {
          samples.push(
            `${cc}/${fiat} (${pick.PaymentMethodType}): ${banks.length} banks — ${banks.slice(0, 3).join(", ")}…`,
          )
        }
      } else {
        withoutBanks++
      }
    }
  }

  console.log(`BankLocal-style corridors with bank_enum: ${withBanks}`)
  console.log(`Bank corridors without bank_enum (SEPA/ACH/etc.): ${withoutBanks}`)
  console.log("\nSamples:")
  for (const s of samples) console.log(" ", s)

  console.log("\n--- KE KES all sell channels ---")
  const keItems = await fetchSellChannelItems({
    country: "KE",
    fiatCurrency: "KES",
    cryptoCurrency: settlement,
  })
  for (const c of keItems) {
    console.log(" ", c.PaymentMethodCategory, "|", c.PaymentMethodType, "|", c.ID)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
