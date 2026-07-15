import type { SupabaseClient } from "@supabase/supabase-js"
import { listYellowcardChannels, type YcChannel } from "@/lib/yellowcard/channels"
import { isYcLocalPayInEnabledForCorridor } from "@/lib/yellowcard/yc-receive-gate"

export type YcReceiveRail = "bank_transfer" | "mobile_money"

export type YcReceiveRailAvailability = {
  bank_transfer: { available: boolean }
  mobile_money: { available: boolean }
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

export function findYcReceiveChannel(
  channels: YcChannel[],
  input: { country: string; currency: string; rail: YcReceiveRail },
): YcChannel | null {
  const country = input.country.trim().toUpperCase()
  const currency = input.currency.trim().toUpperCase()
  return (
    channels.find((ch) => {
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
    bank_transfer: { available: false },
    mobile_money: { available: false },
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
      out[rail].available = true
    }
  }

  return out
}
