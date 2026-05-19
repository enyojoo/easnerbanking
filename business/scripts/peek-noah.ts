import { config } from "dotenv"
config({ path: ".env.local" })
import { noahFetch } from "../lib/noah/http"

async function peek(path: string, query?: Record<string, string>) {
  try {
    const data = await noahFetch<unknown>({ method: "GET", path, query })
    console.log("OK", path, query ? JSON.stringify(query) : "", JSON.stringify(data).slice(0, 800))
  } catch (e: unknown) {
    const status = (e as { status?: number }).status
    console.log("ERR", path, status, e instanceof Error ? e.message.slice(0, 250) : e)
  }
}

async function main() {
  await peek("/channels/sell/countries")
  await peek("/countries")
  await peek("/channels/sell", { CryptoCurrency: "USDC" })
  await peek("/channels/sell", { Country: "NG", FiatCurrency: "NGN", CryptoCurrency: "USDC" })
  await peek("/channels/sell", { Country: "US", FiatCurrency: "USD", CryptoCurrency: "USDC" })
  await peek("/channels/sell", { Country: "KE", FiatCurrency: "KES", CryptoCurrency: "USDC" })
  await peek("/channels/sell", { Country: "GH", FiatCurrency: "GHS", CryptoCurrency: "USDC" })
  await peek("/prices", { SourceCurrency: "USDC", DestinationCurrency: "EURC", SourceAmount: "100" })
  await peek("/prices", { SourceCurrency: "USDC", DestinationCurrency: "NGN", SourceAmount: "100", Country: "NG" })
  await peek("/prices", { SourceCurrency: "USD", DestinationCurrency: "NGN", SourceAmount: "100", Country: "NG" })
  await peek("/balances")
}
main()
