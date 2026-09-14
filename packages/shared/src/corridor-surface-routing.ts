import { settlementAssetForPayoutProvider } from "./bridge-corridors"
import { parseCrossBorderProvider, type CrossBorderProviderId } from "./cross-border-routing"
import type { PayoutProviderId } from "./payout-corridor"
import type { ProviderRoutingEntry } from "./send-destinations"
import { resolveUsPayInMode, type UsPayInMode } from "./us-pay-in-mode"

export const CORRIDOR_ROUTING_SURFACES = ["business", "personal"] as const
export type CorridorRoutingSurface = (typeof CORRIDOR_ROUTING_SURFACES)[number]

export type CorridorSurfaceRouting = {
  payout: PayoutProviderId | null
  pay_in: PayoutProviderId | null
  cross_border: { enabled: boolean; provider: CrossBorderProviderId } | null
  pay_in_mode?: UsPayInMode
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return { ...(value as Record<string, unknown>) }
}

export function routingSurfaceFromUserRole(role: string | null | undefined): CorridorRoutingSurface {
  return role === "individual" ? "personal" : "business"
}

export function parsePayoutProviderId(value: unknown): PayoutProviderId | null {
  const provider = String(value ?? "")
    .trim()
    .toLowerCase()
  if (provider === "noah" || provider === "yellowcard" || provider === "grid" || provider === "bridge") {
    return provider
  }
  return null
}

export function parseProviderRoutingEntries(raw: unknown): ProviderRoutingEntry[] {
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

function routingPrimary(raw: unknown): PayoutProviderId | null {
  const sorted = parseProviderRoutingEntries(raw)
  return parsePayoutProviderId(sorted[0]?.provider)
}

/** Legacy Office payout choice from global routing + send flags (no overlay). */
export function resolveLegacyOfficePayoutProvider(input: {
  provider_routing?: ProviderRoutingEntry[] | null | unknown
  metadata?: unknown
}): PayoutProviderId | null {
  const primary = routingPrimary(input.provider_routing)
  if (!primary) return null
  const meta = asRecord(input.metadata)
  if (primary === "grid" && meta.grid_send_enabled !== true) return null
  if (primary === "bridge" && meta.bridge_send_enabled !== true) return null
  if (primary === "yellowcard" && meta.yc_send_enabled !== true) return null
  if (primary === "noah" && meta.noah_send_enabled !== true) return null
  return primary
}

/** Legacy Office pay-in choice from global receive flags (no overlay). */
export function resolveLegacyOfficePayInProvider(metadata: unknown): PayoutProviderId | null {
  const meta = asRecord(metadata)
  if (meta.grid_receive_enabled === true) return "grid"
  if (meta.bridge_receive_enabled === true) return "bridge"
  if (meta.yc_receive_enabled === true) return "yellowcard"
  if (meta.noah_receive_enabled === true) return "noah"
  return null
}

function cloneLegacySurface(input: {
  provider_routing?: ProviderRoutingEntry[] | null | unknown
  metadata?: unknown
}): CorridorSurfaceRouting {
  const meta = asRecord(input.metadata)
  const cbProvider = parseCrossBorderProvider(meta)
  return {
    payout: resolveLegacyOfficePayoutProvider(input),
    pay_in: resolveLegacyOfficePayInProvider(input.metadata),
    cross_border:
      meta.cross_border_enabled === true
        ? { enabled: true, provider: cbProvider ?? "yellowcard" }
        : null,
    pay_in_mode: resolveUsPayInMode(input.metadata),
  }
}

function parseSurfaceRouting(raw: unknown): CorridorSurfaceRouting | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (!("payout" in o) && !("pay_in" in o) && !("cross_border" in o) && !("pay_in_mode" in o)) {
    return null
  }
  let cross_border: CorridorSurfaceRouting["cross_border"] = null
  if (o.cross_border && typeof o.cross_border === "object" && !Array.isArray(o.cross_border)) {
    const cb = o.cross_border as Record<string, unknown>
    const provider = parseCrossBorderProvider({ cross_border_provider: cb.provider })
    if (cb.enabled === true && provider) {
      cross_border = { enabled: true, provider }
    }
  }
  const payInMode = resolveUsPayInMode({ pay_in_mode: o.pay_in_mode })
  return {
    payout: o.payout == null ? null : parsePayoutProviderId(o.payout),
    pay_in: o.pay_in == null ? null : parsePayoutProviderId(o.pay_in),
    cross_border,
    ...(o.pay_in_mode !== undefined ? { pay_in_mode: payInMode } : {}),
  }
}

export function readCorridorSurfacesMap(metadata: unknown): {
  business?: CorridorSurfaceRouting
  personal?: CorridorSurfaceRouting
} | null {
  const raw = asRecord(metadata).surfaces
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const map = raw as Record<string, unknown>
  const business = parseSurfaceRouting(map.business)
  const personal = parseSurfaceRouting(map.personal)
  if (!business && !personal) return null
  return {
    ...(business ? { business } : {}),
    ...(personal ? { personal } : {}),
  }
}

export function readCorridorSurfaceRouting(
  input: {
    provider_routing?: ProviderRoutingEntry[] | null | unknown
    metadata?: unknown
  },
  surface: CorridorRoutingSurface,
): CorridorSurfaceRouting {
  const overlay = readCorridorSurfacesMap(input.metadata)?.[surface]
  if (overlay) return overlay
  return cloneLegacySurface(input)
}

export function hydrateCorridorSurfacesMetadata(input: {
  provider_routing?: ProviderRoutingEntry[] | null | unknown
  metadata?: unknown
}): Record<string, unknown> {
  const metadata = asRecord(input.metadata)
  const map = readCorridorSurfacesMap(metadata)
  const fallback = cloneLegacySurface(input)
  return {
    ...metadata,
    surfaces: {
      business: map?.business ?? fallback,
      personal: map?.personal ?? fallback,
    },
  }
}

function flattenLegacyFromSurface(
  metadata: Record<string, unknown>,
  overlay: CorridorSurfaceRouting,
): Record<string, unknown> {
  const next = { ...metadata }
  const payout = overlay.payout
  next.noah_send_enabled = payout === "noah"
  next.yc_send_enabled = payout === "yellowcard"
  next.grid_send_enabled = payout === "grid"
  next.bridge_send_enabled = payout === "bridge"
  if (payout === "yellowcard") next.yc_send = true
  if (payout === "grid") next.grid_send = true
  if (payout === "bridge") next.bridge_send = true

  const payIn = overlay.pay_in
  if (payIn) next.pay_in_provider = payIn
  else delete next.pay_in_provider
  next.noah_receive_enabled = payIn === "noah"
  next.yc_receive_enabled = payIn === "yellowcard"
  next.grid_receive_enabled = payIn === "grid"
  next.bridge_receive_enabled = payIn === "bridge"
  if (payIn === "noah") next.noah_receive = true
  if (payIn === "yellowcard") next.yc_receive = true
  if (payIn === "grid") next.grid_receive = true
  if (payIn === "bridge") next.bridge_receive = true

  if (overlay.cross_border?.enabled && overlay.cross_border.provider) {
    next.cross_border_enabled = true
    next.cross_border_provider = overlay.cross_border.provider
  } else {
    next.cross_border_enabled = false
  }

  if (overlay.pay_in_mode) {
    if (overlay.pay_in_mode === "disabled") {
      delete next.pay_in_mode
      next.stripe_express_enabled = false
    } else {
      next.pay_in_mode = overlay.pay_in_mode
      next.stripe_express_enabled = overlay.pay_in_mode === "va_express"
    }
  }
  return next
}

export function patchCorridorSurfaceRouting(
  input: {
    provider_routing?: ProviderRoutingEntry[] | null | unknown
    metadata?: unknown
    currency_code?: string | null
  },
  surface: CorridorRoutingSurface,
  patch: Partial<CorridorSurfaceRouting>,
): { provider_routing: ProviderRoutingEntry[]; metadata: Record<string, unknown> } {
  const hydrated = hydrateCorridorSurfacesMetadata(input)
  const current = readCorridorSurfaceRouting(
    { provider_routing: input.provider_routing, metadata: hydrated },
    surface,
  )
  const next: CorridorSurfaceRouting = { ...current, ...patch }
  const surfaces = {
    ...((hydrated.surfaces as Record<string, CorridorSurfaceRouting>) ?? {}),
    [surface]: next,
  }
  let metadata: Record<string, unknown> = { ...hydrated, surfaces }
  let provider_routing = parseProviderRoutingEntries(input.provider_routing)

  if (surface === "business") {
    metadata = { ...flattenLegacyFromSurface(metadata, next), surfaces }
    provider_routing = next.payout
      ? [
          {
            provider: next.payout,
            priority: 1,
            settlement_asset: settlementAssetForPayoutProvider(next.payout, input.currency_code),
          },
        ]
      : []
  }

  return { provider_routing, metadata }
}

/** Customer catalog / execute: flatten this surface onto the legacy public shape. */
export function projectCorridorForSurface(
  input: {
    provider_routing?: ProviderRoutingEntry[] | null | unknown
    metadata?: unknown
    currency_code?: string | null
  },
  surface: CorridorRoutingSurface,
): { provider_routing: ProviderRoutingEntry[]; metadata: Record<string, unknown> } {
  const overlay = readCorridorSurfaceRouting(input, surface)
  const base = asRecord(input.metadata)
  delete base.surfaces
  const metadata = flattenLegacyFromSurface(base, overlay)
  const provider_routing = overlay.payout
    ? [
        {
          provider: overlay.payout,
          priority: 1,
          settlement_asset: settlementAssetForPayoutProvider(overlay.payout, input.currency_code),
        },
      ]
    : []
  return { provider_routing, metadata }
}

export function surfaceHasCustomerFacingRouting(
  input: {
    provider_routing?: ProviderRoutingEntry[] | null | unknown
    metadata?: unknown
  },
  surface: CorridorRoutingSurface,
): boolean {
  const overlay = readCorridorSurfaceRouting(input, surface)
  if (overlay.payout || overlay.pay_in) return true
  const usMode = overlay.pay_in_mode ?? resolveUsPayInMode(input.metadata)
  return usMode === "va" || usMode === "va_express"
}

/** Sync must merge, not replace, per-product routing overlays. */
export function mergeCorridorMetadataSurfaces(
  nextMetadata: Record<string, unknown>,
  existing: unknown,
): Record<string, unknown> {
  const prior = asRecord(existing)
  if (prior.surfaces != null) {
    nextMetadata.surfaces = prior.surfaces
  }
  return nextMetadata
}
