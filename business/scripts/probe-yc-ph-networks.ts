/**
 * Probe Yellowcard networks for a corridor + send channel (bank name / networkId verification).
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/probe-yc-ph-networks.ts
 *
 * Optional env:
 *   YC_PROBE_COUNTRY=PH
 *   YC_PROBE_CURRENCY=PHP
 *   YC_PROBE_CHANNEL_ID=109b40ff-887c-4441-9c0b-19bd6b4be18f
 *   YC_PROBE_RAIL=bank_transfer   – bank_transfer | mobile_money
 */
import { getYellowcardEnvironment } from "../lib/yellowcard/config"
import { listYellowcardChannels } from "../lib/yellowcard/channels"
import { listYellowcardNetworks, type YcNetwork } from "../lib/yellowcard/networks"
import { findYcSendChannel } from "../lib/payout-providers/yellowcard-provider"
import { pickYcSendNetworkId } from "@easner/shared"

const COUNTRY = String(process.env.YC_PROBE_COUNTRY || "PH").trim().toUpperCase()
const CURRENCY = String(process.env.YC_PROBE_CURRENCY || "PHP").trim().toUpperCase()
const CHANNEL_ID = String(
  process.env.YC_PROBE_CHANNEL_ID || "109b40ff-887c-4441-9c0b-19bd6b4be18f",
).trim()
const RAIL =
  String(process.env.YC_PROBE_RAIL || "bank_transfer").trim() === "mobile_money"
    ? "mobile_money"
    : "bank_transfer"

function networkId(row: YcNetwork): string {
  return String(row.id ?? row.networkId ?? "").trim()
}

function networkLabel(row: YcNetwork): string {
  const raw = row.name ?? row.code ?? networkId(row)
  return String(raw || "–").trim()
}

function isActive(row: YcNetwork): boolean {
  const status = String(row.status ?? "").trim().toLowerCase()
  return !status || status === "active" || status === "enabled"
}

function scopedToChannel(row: YcNetwork, channelId: string): boolean {
  if (!channelId) return true
  const ids = Array.isArray(row.channelIds) ? row.channelIds : []
  if (ids.length === 0) return true
  return ids.some((id) => String(id).trim() === channelId)
}

function printNetworkTable(title: string, rows: YcNetwork[]) {
  console.log(`\n=== ${title} (${rows.length}) ===`)
  if (!rows.length) {
    console.log("  (none)")
    return
  }
  for (const row of rows.sort((a, b) => networkLabel(a).localeCompare(networkLabel(b)))) {
    const id = networkId(row) || "–"
    const label = networkLabel(row)
    const code = String(row.code ?? "").trim()
    const status = String(row.status ?? "–")
    const channelIds = Array.isArray(row.channelIds)
      ? row.channelIds.map((c) => String(c).trim()).filter(Boolean)
      : []
    console.log(`  ${label}`)
    console.log(`    networkId: ${id}`)
    if (code) console.log(`    code:      ${code}`)
    console.log(`    status:    ${status}`)
    if (channelIds.length) console.log(`    channelIds: ${channelIds.join(", ")}`)
  }
}

async function main() {
  console.log("Yellowcard network probe")
  console.log(`  environment: ${getYellowcardEnvironment()}`)
  console.log(`  corridor:    ${COUNTRY} ${CURRENCY} (${RAIL})`)
  console.log(`  channelId:   ${CHANNEL_ID || "(auto from corridor)"}`)

  const channels = await listYellowcardChannels()
  const corridorChannels = channels.filter(
    (ch) =>
      String(ch.country ?? "").trim().toUpperCase() === COUNTRY &&
      String(ch.currency ?? "").trim().toUpperCase() === CURRENCY,
  )

  console.log(`\n=== CHANNELS for ${COUNTRY} ${CURRENCY} (${corridorChannels.length}) ===`)
  for (const ch of corridorChannels) {
    const id = String(ch.id ?? ch.channelId ?? "").trim()
    const ramp = String(ch.rampType ?? "").trim()
    const type = String(ch.channelType ?? "").trim()
    const status = String(ch.status ?? ch.apiStatus ?? "").trim()
    const marker = id === CHANNEL_ID ? " ← probe target" : ""
    console.log(`  ${id}${marker}`)
    console.log(`    rampType: ${ramp || "–"}, channelType: ${type || "–"}, status: ${status || "–"}`)
  }

  const resolvedChannel = await findYcSendChannel({
    countryCode: COUNTRY,
    currencyCode: CURRENCY,
    rail: RAIL,
  })
  const resolvedChannelId = String(resolvedChannel?.id ?? resolvedChannel?.channelId ?? "").trim()
  const effectiveChannelId = CHANNEL_ID || resolvedChannelId

  if (resolvedChannelId && resolvedChannelId !== CHANNEL_ID) {
    console.log(`\n  resolveYcSendChannel → ${resolvedChannelId}`)
  }

  const allNetworks = await listYellowcardNetworks({ country: COUNTRY, currency: CURRENCY })
  const active = allNetworks.filter(isActive)
  const channelScoped = active.filter((n) => scopedToChannel(n, effectiveChannelId))

  printNetworkTable(`ALL ACTIVE NETWORKS (${COUNTRY} ${CURRENCY})`, active)
  printNetworkTable(`CHANNEL-SCOPED (${effectiveChannelId || "n/a"})`, channelScoped)

  const bankEnum = [...new Set(channelScoped.map((n) => networkLabel(n)).filter(Boolean))].sort()
  console.log("\n=== fields_schema.yellowcard.bank_enum (preview) ===")
  if (!bankEnum.length) console.log("  (empty – run corridor schema sync after networks are available)")
  else bankEnum.forEach((name) => console.log(`  - ${name}`))

  const manual = channelScoped.find((n) =>
    networkLabel(n).toLowerCase().includes("manual input"),
  )
  if (manual) {
    console.log(`\n  Manual Input networkId: ${networkId(manual)}`)
  }

  if (bankEnum.length) {
    const sampleBank = bankEnum[0]
    const sampleNetworkId = pickYcSendNetworkId({
      networks: channelScoped,
      channelId: effectiveChannelId,
      bankName: sampleBank,
      isMomo: RAIL === "mobile_money",
    })
    console.log("\n=== pickYcSendNetworkId sample ===")
    console.log(`  bankName:   ${sampleBank}`)
    console.log(`  networkId:  ${sampleNetworkId ?? "(no match)"}`)
  }

  console.log("\nDone.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
