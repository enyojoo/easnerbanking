import { listYellowcardChannels } from "@/lib/yellowcard/channels"

const CACHE_TTL_MS = 10 * 60 * 1000

type PayoutRail = "bank_transfer" | "mobile_money"

type YcCorridorCaps = {
  yc_send: boolean
  yc_receive: boolean
}

let cache: { at: number; byKey: Map<string, YcCorridorCaps> } | null = null

function corridorKey(country: string, currency: string, rail: PayoutRail): string {
  return `${country.toUpperCase()}:${currency.toUpperCase()}:${rail}`
}

function mapChannelTypeToRail(channelType: string | undefined): PayoutRail {
  const t = String(channelType ?? "").toLowerCase()
  return t.includes("momo") || t.includes("mobile") ? "mobile_money" : "bank_transfer"
}

function isActiveChannel(channel: Record<string, unknown>): boolean {
  const status = String(channel.status ?? channel.apiStatus ?? "")
    .trim()
    .toLowerCase()
  return !status || status === "active" || status === "enabled"
}

function buildCapsFromChannels(channels: Array<Record<string, unknown>>): Map<string, YcCorridorCaps> {
  const byKey = new Map<string, YcCorridorCaps>()

  for (const channel of channels) {
    if (!isActiveChannel(channel)) continue

    const country = String(channel.country ?? "").trim().toUpperCase()
    const currency = String(channel.currency ?? "").trim().toUpperCase()
    if (!country || !currency) continue

    const rail = mapChannelTypeToRail(String(channel.channelType ?? ""))
    const key = corridorKey(country, currency, rail)
    const existing = byKey.get(key) ?? { yc_send: false, yc_receive: false }

    const ramp = String(channel.rampType ?? "").toLowerCase()
    if (ramp.includes("withdraw") || ramp.includes("send")) existing.yc_send = true
    if (ramp.includes("deposit") || ramp.includes("receive")) existing.yc_receive = true

    byKey.set(key, existing)
  }

  return byKey
}

async function loadYcCorridorCaps(): Promise<Map<string, YcCorridorCaps>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.byKey

  try {
    const channels = await listYellowcardChannels()
    const byKey = buildCapsFromChannels(channels as Array<Record<string, unknown>>)
    cache = { at: Date.now(), byKey }
    return byKey
  } catch {
    cache = { at: Date.now(), byKey: new Map() }
    return cache.byKey
  }
}

export function clearYcChannelCache(): void {
  cache = null
}

export type YcCorridorCheck = {
  country: string
  currency: string
  rail: PayoutRail
}

export async function getYcCorridorCapabilities(
  input: YcCorridorCheck,
): Promise<{ yc_send: boolean; yc_receive: boolean }> {
  const caps = await loadYcCorridorCaps()
  const hit = caps.get(corridorKey(input.country, input.currency, input.rail))
  return hit ?? { yc_send: false, yc_receive: false }
}

export async function annotateCorridorsWithYcAvailability<
  T extends { country_code: string; currency_code: string; rail: string; metadata?: unknown },
>(rows: T[]): Promise<
  Array<
    T & {
      yc_send_available?: boolean
      yc_receive_available?: boolean
    }
  >
> {
  const caps = await loadYcCorridorCaps()

  return rows.map((row) => {
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {}
    const rail = (row.rail === "mobile_money" ? "mobile_money" : "bank_transfer") as PayoutRail
    const live = caps.get(corridorKey(row.country_code, row.currency_code, rail))

    const yc_send_available = meta.yc_send === true || live?.yc_send === true
    const yc_receive_available = meta.yc_receive === true || live?.yc_receive === true

    const out: T & { yc_send_available?: boolean; yc_receive_available?: boolean } = { ...row }
    if (yc_send_available) out.yc_send_available = true
    if (yc_receive_available) out.yc_receive_available = true
    return out
  })
}
