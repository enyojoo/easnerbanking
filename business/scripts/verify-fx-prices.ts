import { config } from "dotenv"
config({ path: ".env.local" })
import { buildNoahWalletExchangeRates } from "../lib/noah/fx-prices"

async function main() {
  const rates = await buildNoahWalletExchangeRates({
    destinationCurrencies: ["NGN", "EUR", "GBP", "KES", "GHS"],
  })
  for (const r of rates) {
    console.log(`${r.from_currency}→${r.to_currency} country=${r.country} rate=${r.rate.toFixed(4)}`)
  }
  console.log("total", rates.length)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
