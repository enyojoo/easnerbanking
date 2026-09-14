import type { SupabaseClient } from "@supabase/supabase-js"
import {
  resolvePayInProvider,
  resolveGridPayInLimits,
  resolveYcPayInLimits,
  unwrapNoahFieldsSchema,
  validatePayInAmountForProvider,
  type PayoutRail,
} from "@easner/shared"
import { loadUserRoutingSurface } from "@/lib/corridor-routing-surface"
import { loadCorridorRouting } from "@/lib/payout-providers"
import { findYcReceiveChannel } from "@/lib/yellowcard/receive-rails"
import { listYellowcardChannels } from "@/lib/yellowcard/channels"

export async function validateFundBalancePayInAmountLimits(input: {
  admin: SupabaseClient
  countryCode: string
  currencyCode: string
  rail: PayoutRail
  localPayIn: number
  userId?: string | null
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const countryCode = input.countryCode.trim().toUpperCase()
  const currencyCode = input.currencyCode.trim().toUpperCase()
  const rail = input.rail

  const providerRouting = await loadCorridorRouting(input.admin, {
    countryCode,
    currencyCode,
    rail,
    userId: input.userId,
  })

  const { data: corridor } = await input.admin
    .from("payout_corridors")
    .select("fields_schema,provider_routing,metadata")
    .eq("country_code", countryCode)
    .eq("currency_code", currencyCode)
    .eq("rail", rail)
    .maybeSingle()

  const routing = providerRouting.length
    ? providerRouting
    : ((corridor?.provider_routing as typeof providerRouting | null) ?? [])
  const metadata = (corridor?.metadata ?? {}) as Record<string, unknown>
  const surface = await loadUserRoutingSurface(input.admin, input.userId)
  const provider = resolvePayInProvider({ providerRouting: routing, metadata, surface })
  const noahHints = unwrapNoahFieldsSchema(corridor?.fields_schema)

  let ycLimits = null
  let gridLimits = null
  if (provider === "yellowcard") {
    const channels = await listYellowcardChannels()
    const channel = findYcReceiveChannel(channels, {
      country: countryCode,
      currency: currencyCode,
      rail,
    })
    ycLimits = resolveYcPayInLimits({
      country: countryCode,
      currency: currencyCode,
      rail,
      channel: (channel as Record<string, unknown> | null) ?? null,
    })
  } else if (provider === "grid") {
    gridLimits = resolveGridPayInLimits({
      country: countryCode,
      currency: currencyCode,
      rail,
    })
  }

  const check = validatePayInAmountForProvider({
    providerRouting: routing,
    metadata,
    provider,
    localPayIn: input.localPayIn,
    currency: currencyCode,
    rail,
    noahHints,
    ycLimits,
    gridLimits,
  })

  return check.ok ? { ok: true } : { ok: false, message: check.message }
}
