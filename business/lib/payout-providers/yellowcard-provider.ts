import {
  listYellowcardChannels,
  readYcChannelId,
  ycSubmitChannelTypeFromChannel,
  type YcChannel,
  type YcChannelType,
} from "@/lib/yellowcard/channels"
import type { CorridorContext, PayoutProvider } from "./types"

let channelCache: { at: number; channels: YcChannel[] } | null = null
const CACHE_TTL_MS = 5 * 60_000

async function loadChannels(): Promise<YcChannel[]> {
  if (channelCache && Date.now() - channelCache.at < CACHE_TTL_MS) {
    return channelCache.channels
  }
  try {
    const channels = await listYellowcardChannels()
    channelCache = { at: Date.now(), channels }
    return channels
  } catch (e) {
    console.warn("[yellowcard-provider] channels load failed", e)
    return channelCache?.channels ?? []
  }
}

function channelActive(ch: YcChannel): boolean {
  const status = String(ch.status ?? ch.apiStatus ?? "")
    .trim()
    .toLowerCase()
  return !status || status === "active" || status === "enabled"
}

function matchesCorridor(ch: YcChannel, ctx: CorridorContext): boolean {
  const country = String(ch.country ?? "").trim().toUpperCase()
  const currency = String(ch.currency ?? "").trim().toUpperCase()
  if (country !== ctx.countryCode || currency !== ctx.currencyCode) return false
  const ramp = String(ch.rampType ?? ch.type ?? "")
    .trim()
    .toLowerCase()
  // Prefer send/withdraw channels for payout
  if (ramp && ramp.includes("deposit") && !ramp.includes("withdraw") && !ramp.includes("send")) {
    return false
  }
  const channelType = String(ch.channelType ?? "").trim().toLowerCase()
  if (ctx.rail === "mobile_money") {
    return channelType.includes("momo") || channelType.includes("mobile")
  }
  // p2pmomo is a momo rail, not bank P2P (NG).
  if (channelType.includes("momo") || channelType.includes("mobile")) return false
  // ZA Instant EFT / NG P2P are live bank-rail withdraw types.
  return (
    channelType.includes("bank") ||
    channelType.includes("eft") ||
    channelType.includes("p2p") ||
    channelType === ""
  )
}

/** Prefer classic momo, then p2pmomo; bank then Instant EFT (ZA), then P2P (NG). */
function sendChannelPreference(ch: YcChannel, rail: CorridorContext["rail"]): number {
  const t = String(ch.channelType ?? "").trim().toLowerCase()
  if (rail === "mobile_money") {
    if (t === "momo") return 0
    if (t.includes("p2pmomo")) return 1
    if (t.includes("momo") || t.includes("mobile")) return 2
    return 9
  }
  if (t === "bank" || (t.includes("bank") && !t.includes("eft"))) return 0
  if (t === "eft" || t.includes("eft")) return 1
  if (t === "p2p" || t.includes("p2p")) return 2
  return 3
}

function pickerNetworkCount(
  ch: YcChannel,
  networks: Array<{ name?: string; status?: string; channelIds?: string[] }> | undefined,
): number {
  if (!networks?.length) return 0
  const channelId = readYcChannelId(ch)
  if (!channelId) return 0
  return networks.filter((n) => {
    const status = String(n.status ?? "").trim().toLowerCase()
    if (status === "inactive" || status === "disabled") return false
    const name = String(n.name ?? "").trim()
    if (!name || name.toLowerCase().includes("manual input")) return false
    return Array.isArray(n.channelIds) && n.channelIds.some((id) => String(id).trim() === channelId)
  }).length
}

export const yellowcardPayoutProvider: PayoutProvider = {
  id: "yellowcard",
  async supports(ctx: CorridorContext): Promise<boolean> {
    const channels = await loadChannels()
    return channels.some((ch) => channelActive(ch) && matchesCorridor(ch, ctx))
  },
}

/** Resolve a YC send channelId for corridor. */
export async function resolveYcSendChannelId(ctx: {
  countryCode: string
  currencyCode: string
  rail: "bank_transfer" | "mobile_money"
}): Promise<string | null> {
  const channel = await findYcSendChannel(ctx)
  if (!channel) return null
  return readYcChannelId(channel)
}

export type YcSendSubmitChannel = {
  channelId: string
  channelType: YcChannelType
}

/** Live send channel id + YC channelType for POST /send. */
export async function resolveYcSendSubmitChannel(ctx: {
  countryCode: string
  currencyCode: string
  rail: "bank_transfer" | "mobile_money"
  channelId?: string | null
}): Promise<YcSendSubmitChannel | null> {
  const channels = await loadChannels()
  const hinted = String(ctx.channelId ?? "").trim()
  if (hinted) {
    const byId = channels.find((ch) => readYcChannelId(ch) === hinted)
    if (byId && channelActive(byId)) {
      return {
        channelId: hinted,
        channelType: ycSubmitChannelTypeFromChannel(byId, ctx.rail),
      }
    }
  }
  const channel = await findYcSendChannel(ctx)
  const channelId = readYcChannelId(channel)
  if (!channel || !channelId) return null
  return {
    channelId,
    channelType: ycSubmitChannelTypeFromChannel(channel, ctx.rail),
  }
}

/** Full YC send channel row for corridor (limits, ids). */
export async function findYcSendChannel(ctx: {
  countryCode: string
  currencyCode: string
  rail: "bank_transfer" | "mobile_money"
}): Promise<YcChannel | null> {
  return findYcCorridorChannel({ ...ctx, includeInactive: false })
}

/** Schema sync: live send channel, or matching inactive withdraw if YC paused the rail. */
export async function findYcCorridorChannel(ctx: {
  countryCode: string
  currencyCode: string
  rail: "bank_transfer" | "mobile_money"
  includeInactive?: boolean
  networks?: Array<{ name?: string; status?: string; channelIds?: string[] }>
}): Promise<YcChannel | null> {
  const channels = await loadChannels()
  const matches = channels.filter((ch) => {
    if (!ctx.includeInactive && !channelActive(ch)) return false
    return matchesCorridor(ch, {
      countryCode: ctx.countryCode,
      currencyCode: ctx.currencyCode,
      rail: ctx.rail,
      providerRouting: [],
    })
  })
  if (!matches.length) return null
  matches.sort((a, b) => {
    const activeDelta = Number(channelActive(b)) - Number(channelActive(a))
    if (activeDelta !== 0) return activeDelta
    const pref = sendChannelPreference(a, ctx.rail) - sendChannelPreference(b, ctx.rail)
    if (pref !== 0) return pref
    return pickerNetworkCount(b, ctx.networks) - pickerNetworkCount(a, ctx.networks)
  })
  return matches[0] ?? null
}
