/** Check DK:EUR bank support across Grid, Noah, YC. */
import { hasNoahSellChannel, hasNoahSellChannelForRail } from "../lib/noah/channel-availability"
import { fetchSellChannelItems } from "../lib/noah/payout-prepare"
import { getNoahSettlementCryptoCurrency } from "../lib/noah/config"
import { listYellowcardChannels } from "../lib/yellowcard/channels"
import { gridDiscoverySupportsCorridor, listGridDiscoveries } from "../lib/grid/discoveries"

async function main() {
  const country = "DK"
  const currency = "EUR"
  const rail = "bank_transfer" as const

  const [noah, noahRail, discoveries, ycChannels] = await Promise.all([
    hasNoahSellChannel({ country, fiatCurrency: currency }),
    hasNoahSellChannelForRail({ country, fiatCurrency: currency, rail }),
    listGridDiscoveries(true),
    listYellowcardChannels(),
  ])

  const grid = gridDiscoverySupportsCorridor({
    discoveries,
    countryCode: country,
    currencyCode: currency,
    rail,
  })

  const yc = ycChannels.filter((ch) => {
    const cc = String(ch.country ?? "").toUpperCase()
    const cur = String(ch.currency ?? "").toUpperCase()
    if (cc !== country || cur !== currency) return false
    const channelType = String(ch.channelType ?? "").toLowerCase()
    const chRail = channelType.includes("momo") ? "mobile_money" : "bank_transfer"
    return chRail === rail
  })

  console.log("DK:EUR bank_transfer")
  console.log("  Grid:", grid)
  console.log("  Noah sell:", noah, "(rail-specific:", noahRail + ")")
  console.log("  YC channels:", yc.length)
  for (const ch of yc) {
    console.log(
      `    ${ch.id} type=${ch.channelType} ramp=${ch.rampType} status=${ch.status}/${ch.apiStatus}`,
    )
  }

  // Also show any EUR YC channels for context
  const eurYc = ycChannels.filter((ch) => String(ch.currency ?? "").toUpperCase() === "EUR")
  const eurCountries = [...new Set(eurYc.map((ch) => String(ch.country ?? "").toUpperCase()))].sort()
  console.log("\nYC EUR countries:", eurCountries.join(", ") || "(none)")

  const dkYc = ycChannels.filter((ch) => String(ch.country ?? "").toUpperCase() === "DK")
  console.log("YC DK channels:", dkYc.length)
  for (const ch of dkYc) {
    console.log(`  ${ch.currency} ${ch.channelType} ${ch.rampType}`)
  }

  const noahItems = await fetchSellChannelItems({
    country,
    fiatCurrency: currency,
    cryptoCurrency: getNoahSettlementCryptoCurrency(),
  })
  console.log("\nNoah sell channels for DK/EUR:")
  for (const item of noahItems) {
    console.log(
      `  ${item.ID} category=${item.PaymentMethodCategory} type=${item.PaymentMethodType}`,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
