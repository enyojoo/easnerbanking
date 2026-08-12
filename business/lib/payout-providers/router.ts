import type { SupabaseClient } from "@supabase/supabase-js"
import type { ProviderRoutingEntry } from "@easner/shared"
import { isGridDigitalAssetJurisdiction } from "@easner/shared"
import { gridPayoutProvider } from "./grid-provider"
import { noahPayoutProvider } from "./noah-provider"
import { yellowcardPayoutProvider } from "./yellowcard-provider"
import { resolvePayoutSenderCountryCode } from "./resolve-sender-country"
import type { CorridorContext, PayoutProvider, PayoutRailKind } from "./types"
import { NoProviderForCorridorError } from "./types"

const registry: Record<string, PayoutProvider> = {
  noah: noahPayoutProvider,
  yellowcard: yellowcardPayoutProvider,
  grid: gridPayoutProvider,
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

/**
 * Grid digital-asset extra residences cannot use Grid payouts.
 * Strip `grid` and keep priority order among remaining providers.
 */
export function filterProviderRoutingForSender(
  routing: ProviderRoutingEntry[],
  senderCountryCode: string | null | undefined,
): ProviderRoutingEntry[] {
  if (!isGridDigitalAssetJurisdiction(senderCountryCode)) {
    return routing
  }
  return routing
    .filter((entry) => String(entry.provider).trim().toLowerCase() !== "grid")
    .sort((a, b) => a.priority - b.priority)
}

/**
 * Manual Office routing: use the priority-1 provider only.
 * Do not walk secondaries (that would be auto-failover).
 * Sender digital-asset filter may remove Grid before picking primary.
 */
export async function selectProvider(ctx: CorridorContext): Promise<PayoutProvider> {
  const routing = filterProviderRoutingForSender(
    parseRouting(ctx.providerRouting),
    ctx.senderCountryCode,
  )
  if (!routing.length) {
    throw new NoProviderForCorridorError(
      isGridDigitalAssetJurisdiction(ctx.senderCountryCode)
        ? "Grid payouts are not available for your country of registration. Use another configured payout provider for this corridor."
        : "Payout provider is not configured for this corridor. Enable a provider in Office Platform Control.",
    )
  }

  const primary = routing[0]!
  const provider = registry[primary.provider]
  if (!provider) {
    throw new NoProviderForCorridorError(`Unknown payout provider: ${primary.provider}`)
  }
  if (!(await provider.supports(ctx))) {
    throw new NoProviderForCorridorError(
      `Office-selected provider (${primary.provider}) cannot execute payouts on this corridor yet. Sync corridors or choose another provider.`,
    )
  }
  return provider
}

/**
 * Load Office payout routing for a corridor.
 * Empty when disabled or unset — callers must fail closed (no silent Noah default).
 */
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

  if (!data?.enabled) return []
  return parseRouting(data.provider_routing)
}

export async function selectProviderForCorridor(
  admin: SupabaseClient,
  input: {
    countryCode: string
    currencyCode: string
    rail: PayoutRailKind
    mobileProvider?: string | null
    bankName?: string | null
    senderCountryCode?: string | null
    businessId?: string | null
    userId?: string | null
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

  let senderCountryCode = input.senderCountryCode ?? null
  if (!senderCountryCode && (input.businessId || input.userId)) {
    senderCountryCode = await resolvePayoutSenderCountryCode(admin, {
      businessId: input.businessId,
      userId: input.userId,
    })
  }

  return selectProvider({
    countryCode: input.countryCode.trim().toUpperCase(),
    currencyCode: input.currencyCode.trim().toUpperCase(),
    rail,
    providerRouting,
    senderCountryCode,
  })
}

/** True when Yellowcard is the Office primary and has an active send channel. */
export async function corridorHasYellowcardPayout(
  admin: SupabaseClient,
  input: {
    countryCode: string
    currencyCode: string
    rail: PayoutRailKind
  },
): Promise<boolean> {
  const cc = input.countryCode.trim().toUpperCase()
  const cur = input.currencyCode.trim().toUpperCase()
  const routing = await loadCorridorRouting(admin, {
    countryCode: cc,
    currencyCode: cur,
    rail: input.rail,
  })
  const primary = routing[0]?.provider
  if (primary !== "yellowcard") return false
  return yellowcardPayoutProvider.supports({
    countryCode: cc,
    currencyCode: cur,
    rail: input.rail,
    providerRouting: routing,
  })
}
