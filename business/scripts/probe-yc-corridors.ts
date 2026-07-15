/**
 * Probe Yellowcard sandbox/production channels and compare send coverage with Noah.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/probe-yc-corridors.ts
 *
 * Optional:
 *   PROBE_WRITE_MANIFEST=true  → writes docs/yc-payout-manifest.json
 *                              → docs/payout-coverage-matrix.json (when Noah creds present)
 */

import { writeFileSync } from "fs"
import { join } from "path"
import { isExcludedPayoutCorridorCountry } from "../lib/payout-corridors-exclusions"
import { NoahHttpError, noahFetch } from "../lib/noah/http"
import { getNoahSettlementCryptoCurrency } from "../lib/noah/config"
import { getYellowcardEnvironment } from "../lib/yellowcard/config"
import { YellowcardHttpError, yellowcardFetch } from "../lib/yellowcard/http"

type PayoutRail = "bank_transfer" | "mobile_money"

type YcChannel = {
  id?: string
  country?: string
  currency?: string
  channelType?: string
  rampType?: "deposit" | "withdraw" | string
  status?: string
  apiStatus?: string
}

type CorridorCaps = {
  country_code: string
  currency_code: string
  rail: PayoutRail
  yc_send: boolean
  yc_receive: boolean
  yc_channel_types: string[]
  yc_channel_count: number
  noah_sell: boolean
  noah_channel_count: number
  noah_rails: string[]
}

function errMsg(e: unknown): string {
  if (e instanceof YellowcardHttpError) return `${e.status}: ${String(e.message).slice(0, 120)}`
  if (e instanceof NoahHttpError) return `${e.status}: ${String(e.message).slice(0, 120)}`
  return e instanceof Error ? e.message.slice(0, 120) : String(e)
}

function normCountry(value: string | undefined): string {
  return String(value || "").trim().toUpperCase()
}

function normCurrency(value: string | undefined): string {
  return String(value || "").trim().toUpperCase()
}

function corridorKey(country: string, currency: string, rail: PayoutRail): string {
  return `${country}:${currency}:${rail}`
}

function mapYcChannelTypeToRail(channelType: string | undefined): PayoutRail {
  return String(channelType || "").toLowerCase() === "momo" ? "mobile_money" : "bank_transfer"
}

function isActiveYcChannel(channel: YcChannel): boolean {
  return channel.apiStatus === "active" && channel.status === "active"
}

async function fetchYcChannels(): Promise<YcChannel[]> {
  const data = await yellowcardFetch<{ channels?: YcChannel[] } | YcChannel[]>({
    method: "GET",
    path: "/channels",
  })
  if (Array.isArray(data)) return data
  return data.channels ?? []
}

function buildYcCorridorMap(channels: YcChannel[]): Map<string, CorridorCaps> {
  const map = new Map<string, CorridorCaps>()

  for (const channel of channels) {
    if (!isActiveYcChannel(channel)) continue

    const country_code = normCountry(channel.country)
    const currency_code = normCurrency(channel.currency)
    if (!country_code || !currency_code) continue
    if (isExcludedPayoutCorridorCountry(country_code)) continue

    const rail = mapYcChannelTypeToRail(channel.channelType)
    const key = corridorKey(country_code, currency_code, rail)
    const existing =
      map.get(key) ??
      ({
        country_code,
        currency_code,
        rail,
        yc_send: false,
        yc_receive: false,
        yc_channel_types: [],
        yc_channel_count: 0,
        noah_sell: false,
        noah_channel_count: 0,
        noah_rails: [],
      } satisfies CorridorCaps)

    existing.yc_channel_count += 1
    const typeLabel = String(channel.channelType || "unknown").toLowerCase()
    if (!existing.yc_channel_types.includes(typeLabel)) {
      existing.yc_channel_types.push(typeLabel)
    }
    if (channel.rampType === "withdraw") existing.yc_send = true
    if (channel.rampType === "deposit") existing.yc_receive = true

    map.set(key, existing)
  }

  return map
}

async function buildNoahSellMap(): Promise<Map<string, Pick<CorridorCaps, "noah_sell" | "noah_channel_count" | "noah_rails">>> {
  const out = new Map<string, Pick<CorridorCaps, "noah_sell" | "noah_channel_count" | "noah_rails">>()
  const settlement = getNoahSettlementCryptoCurrency()

  let countriesMap: Record<string, string[]>
  try {
    countriesMap = await noahFetch<Record<string, string[]>>({
      method: "GET",
      path: "/channels/sell/countries",
    })
  } catch (e) {
    console.warn("Noah compare skipped:", errMsg(e))
    return out
  }

  for (const [country, fiats] of Object.entries(countriesMap)) {
    if (!Array.isArray(fiats)) continue
    const country_code = normCountry(country)
    if (!country_code || isExcludedPayoutCorridorCountry(country_code)) continue

    for (const fiat of [...new Set(fiats.map((f) => normCurrency(f)))]) {
      if (!fiat) continue
      try {
        const data = await noahFetch<{ Items?: Array<Record<string, unknown>> }>({
          method: "GET",
          path: "/channels/sell",
          query: { Country: country_code, FiatCurrency: fiat, CryptoCurrency: settlement },
        })
        const items = data.Items ?? []
        if (items.length === 0) continue

        const hasIdentifier = items.some(
          (x) => String(x.PaymentMethodCategory ?? "") === "Identifier",
        )
        const rails: PayoutRail[] = hasIdentifier
          ? ["bank_transfer", "mobile_money"]
          : ["bank_transfer"]
        const types = [
          ...new Set(items.map((x) => String(x.PaymentMethodCategory ?? "?"))),
        ]

        for (const rail of rails) {
          const key = corridorKey(country_code, fiat, rail)
          out.set(key, {
            noah_sell: true,
            noah_channel_count: items.length,
            noah_rails: types,
          })
        }
      } catch {
        // skip pair
      }
    }
  }

  return out
}

function mergeCoverage(
  ycMap: Map<string, CorridorCaps>,
  noahMap: Map<string, Pick<CorridorCaps, "noah_sell" | "noah_channel_count" | "noah_rails">>,
): CorridorCaps[] {
  const keys = new Set([...ycMap.keys(), ...noahMap.keys()])
  const rows: CorridorCaps[] = []

  for (const key of keys) {
    const yc = ycMap.get(key)
    const noah = noahMap.get(key)
    if (!yc && !noah) continue

    rows.push({
      country_code: yc?.country_code ?? key.split(":")[0]!,
      currency_code: yc?.currency_code ?? key.split(":")[1]!,
      rail: yc?.rail ?? (key.split(":")[2] as PayoutRail),
      yc_send: yc?.yc_send ?? false,
      yc_receive: yc?.yc_receive ?? false,
      yc_channel_types: yc?.yc_channel_types ?? [],
      yc_channel_count: yc?.yc_channel_count ?? 0,
      noah_sell: noah?.noah_sell ?? false,
      noah_channel_count: noah?.noah_channel_count ?? 0,
      noah_rails: noah?.noah_rails ?? [],
    })
  }

  return rows.sort(
    (a, b) =>
      a.country_code.localeCompare(b.country_code) ||
      a.currency_code.localeCompare(b.currency_code) ||
      a.rail.localeCompare(b.rail),
  )
}

function supportLabel(row: CorridorCaps): string {
  const parts: string[] = []
  if (row.noah_sell) parts.push("Noah")
  if (row.yc_send) parts.push("YC Send")
  if (row.yc_receive) parts.push("YC Receive")
  return parts.length ? parts.join(" · ") : "—"
}

function printTable(title: string, rows: CorridorCaps[]) {
  console.log(`\n=== ${title} ===`)
  console.log(
    `${"CC".padEnd(4)} ${"Fiat".padEnd(4)} ${"Rail".padEnd(14)} ${"YC Send".padEnd(8)} ${"YC Recv".padEnd(8)} ${"Noah".padEnd(6)} Support`,
  )
  for (const row of rows) {
    console.log(
      `${row.country_code.padEnd(4)} ${row.currency_code.padEnd(4)} ${row.rail.padEnd(14)} ${(row.yc_send ? "yes" : "—").padEnd(8)} ${(row.yc_receive ? "yes" : "—").padEnd(8)} ${(row.noah_sell ? "yes" : "—").padEnd(6)} ${supportLabel(row)}`,
    )
  }
}

async function main() {
  console.log(`Yellowcard corridor probe (${getYellowcardEnvironment()})`)
  console.log("---\n")

  const channels = await fetchYcChannels()
  const active = channels.filter(isActiveYcChannel)
  console.log(`YC channels total=${channels.length} active=${active.length}`)

  const rampTypes = [...new Set(active.map((c) => c.rampType).filter(Boolean))]
  const channelTypes = [...new Set(active.map((c) => c.channelType).filter(Boolean))]
  console.log(`YC rampType: ${rampTypes.join(", ") || "—"}`)
  console.log(`YC channelType: ${channelTypes.join(", ") || "—"}`)

  const ycMap = buildYcCorridorMap(channels)
  const ycRows = [...ycMap.values()].sort(
    (a, b) =>
      a.country_code.localeCompare(b.country_code) ||
      a.currency_code.localeCompare(b.currency_code) ||
      a.rail.localeCompare(b.rail),
  )

  printTable("YELLOWCARD CORRIDORS (active channels)", ycRows)

  const sendRows = ycRows.filter((r) => r.yc_send)
  const receiveRows = ycRows.filter((r) => r.yc_receive)
  console.log(`\nYC send corridors: ${sendRows.length}`)
  console.log(`YC receive corridors: ${receiveRows.length}`)

  const noahMap = await buildNoahSellMap()
  const merged = mergeCoverage(ycMap, noahMap)

  if (noahMap.size > 0) {
    printTable("NOAH vs YC SEND / YC RECEIVE", merged)

    const overlap = merged.filter((r) => r.noah_sell && r.yc_send)
    const ycOnly = merged.filter((r) => r.yc_send && !r.noah_sell)
    const noahOnly = merged.filter((r) => r.noah_sell && !r.yc_send)

    console.log("\n=== SUMMARY ===")
    console.log(`Merged corridor rows: ${merged.length}`)
    console.log(`Both Noah sell + YC send: ${overlap.length}`)
    console.log(`YC send only: ${ycOnly.length}`)
    console.log(`Noah sell only: ${noahOnly.length}`)

    if (overlap.length) {
      console.log("\nOverlap (office may choose provider):")
      for (const row of overlap) {
        console.log(`  ${row.country_code} ${row.currency_code} ${row.rail}`)
      }
    }
  } else {
    console.log("\n(Noah comparison skipped — configure NOAH_API_KEY + signing key for matrix.)")
  }

  if (process.env.PROBE_WRITE_MANIFEST === "true") {
    const generated_at = new Date().toISOString()
    const ycManifest = {
      generated_at,
      environment: getYellowcardEnvironment(),
      corridors: ycRows,
    }
    const ycPath = join(process.cwd(), "..", "docs", "yc-payout-manifest.json")
    writeFileSync(ycPath, JSON.stringify(ycManifest, null, 2))

    const matrixPath = join(process.cwd(), "..", "docs", "payout-coverage-matrix.json")
    writeFileSync(
      matrixPath,
      JSON.stringify(
        {
          generated_at,
          yc_environment: getYellowcardEnvironment(),
          rows: merged,
        },
        null,
        2,
      ),
    )

    console.log(`\nWrote ${ycPath}`)
    console.log(`Wrote ${matrixPath}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
