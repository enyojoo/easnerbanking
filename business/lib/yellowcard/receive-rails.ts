import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveYcPayInLimits } from "@easner/shared"
import { listYellowcardChannels, type YcChannel } from "@/lib/yellowcard/channels"
import { isYcLocalPayInEnabledForCorridor } from "@/lib/yellowcard/yc-receive-gate"

export type YcReceiveRail = "bank_transfer" | "mobile_money"

export type YcReceiveRailInfo = {
  available: boolean
  minLocalPayIn: number | null
  maxLocalPayIn: number | null
}

export type YcReceiveRailAvailability = {
  bank_transfer: YcReceiveRailInfo
  mobile_money: YcReceiveRailInfo
}

function channelMatchesReceiveRail(
  ch: YcChannel,
  rail: YcReceiveRail,
): boolean {
  const ramp = String(ch.rampType ?? "").toLowerCase()
  if (ramp.includes("withdraw") || ramp.includes("send")) return false
  const t = String(ch.channelType ?? "").toLowerCase()
  return rail === "mobile_money" ? t.includes("momo") : t.includes("bank") || !t.includes("momo")
}

/** YC may return disabled corridor rows — never submit receive against them. */
export function isYcReceiveChannelActive(ch: YcChannel): boolean {
  const apiStatus = String(ch.apiStatus ?? "").trim().toLowerCase()
  const status = String(ch.status ?? "").trim().toLowerCase()
  if (apiStatus === "disabled" || status === "disabled") return false
  if (apiStatus && apiStatus !== "active") return false
  if (status && status !== "active" && status !== "enabled") return false
  return true
}

export function findYcReceiveChannel(
  channels: YcChannel[],
  input: { country: string; currency: string; rail: YcReceiveRail },
): YcChannel | null {
  const country = input.country.trim().toUpperCase()
  const currency = input.currency.trim().toUpperCase()
  return (
    channels.find((ch) => {
      if (!isYcReceiveChannelActive(ch)) return false
      if (String(ch.country ?? "").toUpperCase() !== country) return false
      if (String(ch.currency ?? "").toUpperCase() !== currency) return false
      return channelMatchesReceiveRail(ch, input.rail)
    }) ?? null
  )
}

export async function resolveYcReceiveRailAvailability(
  admin: SupabaseClient,
  input: { countryCode: string; currencyCode: string },
): Promise<YcReceiveRailAvailability> {
  const country = input.countryCode.trim().toUpperCase()
  const currency = input.currencyCode.trim().toUpperCase()
  const out: YcReceiveRailAvailability = {
    bank_transfer: { available: false, minLocalPayIn: null, maxLocalPayIn: null },
    mobile_money: { available: false, minLocalPayIn: null, maxLocalPayIn: null },
  }
  if (!country || !currency) return out

  const channels = await listYellowcardChannels()
  const rails: YcReceiveRail[] = ["bank_transfer", "mobile_money"]

  for (const rail of rails) {
    const corridorOk = await isYcLocalPayInEnabledForCorridor(admin, {
      countryCode: country,
      currencyCode: currency,
      rail,
    })
    if (!corridorOk) continue
    const channel = findYcReceiveChannel(channels, { country, currency, rail })
    if (channel) {
      const limits = resolveYcPayInLimits({
        country,
        currency,
        rail,
        channel: channel as Record<string, unknown>,
      })
      out[rail] = {
        available: true,
        minLocalPayIn: limits.minLocalPayIn,
        maxLocalPayIn: limits.maxLocalPayIn,
      }
    }
  }

  return out
}
