import type { SupabaseClient } from "@supabase/supabase-js"
import type { ProviderRoutingEntry } from "@easner/shared"
import { noahPayoutProvider } from "./noah-provider"
import { yellowcardPayoutProvider } from "./yellowcard-provider"
import type { CorridorContext, PayoutProvider, PayoutRailKind } from "./types"
import { NoProviderForCorridorError } from "./types"

const registry: Record<string, PayoutProvider> = {
  noah: noahPayoutProvider,
  yellowcard: yellowcardPayoutProvider,
}

function parseRouting(raw: unknown): ProviderRoutingEntry[] {
  if (!Array.isArray(raw)) return []
  const out: ProviderRoutingEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const provider = String(o.provider ?? "").trim()
    const priority = Number(o.priority)
    if (!provider || !Number.isFinite(priority)) continue
    out.push({
      provider,
      priority,
      ...(o.settlement_asset ? { settlement_asset: String(o.settlement_asset) } : {}),
    })
  }
  return out.sort((a, b) => a.priority - b.priority)
}

function defaultRouting(): ProviderRoutingEntry[] {
  return [{ provider: "noah", priority: 1, settlement_asset: "USDC" }]
}

export async function selectProvider(ctx: CorridorContext): Promise<PayoutProvider> {
  const routing = ctx.providerRouting.length ? ctx.providerRouting : defaultRouting()
  for (const entry of routing) {
    const provider = registry[entry.provider]
    if (!provider) continue
    if (await provider.supports(ctx)) return provider
  }
  throw new NoProviderForCorridorError()
}

export async function loadCorridorRouting(
  admin: SupabaseClient,
  input: { countryCode: string; currencyCode: string; rail: PayoutRailKind },
): Promise<ProviderRoutingEntry[]> {
  const cc = input.countryCode.trim().toUpperCase()
  const cur = input.currencyCode.trim().toUpperCase()
  const { data } = await admin
    .from("payout_corridors")
    .select("provider_routing,enabled")
    .eq("rail", input.rail)
    .eq("country_code", cc)
    .eq("currency_code", cur)
    .maybeSingle()

  if (!data?.enabled) return defaultRouting()
  const routing = parseRouting(data.provider_routing)
  return routing.length ? routing : defaultRouting()
}

export async function selectProviderForCorridor(
  admin: SupabaseClient,
  input: {
    countryCode: string
    currencyCode: string
    rail: PayoutRailKind
    mobileProvider?: string | null
    bankName?: string | null
  },
): Promise<PayoutProvider> {
  const rail: PayoutRailKind =
    input.mobileProvider || String(input.bankName || "").toLowerCase().includes("mobile money")
      ? "mobile_money"
      : "bank_transfer"

  const providerRouting = await loadCorridorRouting(admin, {
    countryCode: input.countryCode,
    currencyCode: input.currencyCode,
    rail,
  })

  return selectProvider({
    countryCode: input.countryCode.trim().toUpperCase(),
    currencyCode: input.currencyCode.trim().toUpperCase(),
    rail,
    providerRouting,
  })
}
