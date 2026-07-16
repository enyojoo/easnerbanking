import { listYellowcardChannels, type YcChannel } from "@/lib/yellowcard/channels"
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
  return channelType.includes("bank") || channelType === "" || !channelType.includes("momo")
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
  return String(channel.id ?? channel.channelId ?? "").trim() || null
}

/** Full YC send channel row for corridor (limits, ids). */
export async function findYcSendChannel(ctx: {
  countryCode: string
  currencyCode: string
  rail: "bank_transfer" | "mobile_money"
}): Promise<YcChannel | null> {
  const channels = await loadChannels()
  const match = channels.find(
    (ch) =>
      channelActive(ch) &&
      matchesCorridor(ch, {
        countryCode: ctx.countryCode,
        currencyCode: ctx.currencyCode,
        rail: ctx.rail,
        providerRouting: [],
      }),
  )
  return match ?? null
}
