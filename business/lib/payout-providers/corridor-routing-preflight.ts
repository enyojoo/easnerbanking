import type { SupabaseClient } from "@supabase/supabase-js"
import {
  isNestedPayoutFieldsSchema,
  resolvePrimaryPayoutProvider,
  type ProviderRoutingEntry,
} from "@easner/shared"
import { NoProviderForCorridorError } from "./types"

export type CorridorRoutingPreflightIssue = {
  code:
    | "ROUTING_EMPTY"
    | "PROVIDER_UNKNOWN"
    | "SCHEMA_PENDING"
    | "SEND_FLAG_DISABLED"
    | "RECEIVE_FLAG_DISABLED"
  message: string
}

function parseRouting(raw: unknown): ProviderRoutingEntry[] {
  if (!Array.isArray(raw)) return []
  const out: ProviderRoutingEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const provider = String(o.provider ?? "").trim().toLowerCase()
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

function schemaReadyForProvider(fieldsSchema: unknown, provider: string): boolean {
  if (!isNestedPayoutFieldsSchema(fieldsSchema)) {
    // Legacy flat Noah-shaped schema – acceptable only for Noah primary.
    return provider === "noah" && fieldsSchema != null && typeof fieldsSchema === "object"
  }
  const nested = fieldsSchema as {
    noah?: unknown
    yellowcard?: { status?: string } | null
    grid?: { status?: string } | null
  }
  if (provider === "noah") return nested.noah != null && typeof nested.noah === "object"
  if (provider === "yellowcard") {
    const yc = nested.yellowcard
    if (!yc || typeof yc !== "object") return false
    return String(yc.status ?? "ready").toLowerCase() !== "pending_schema"
  }
  if (provider === "grid") {
    const grid = nested.grid
    if (!grid || typeof grid !== "object") return false
    return String(grid.status ?? "ready").toLowerCase() !== "pending_schema"
  }
  return false
}

/**
 * Validate Office corridor PATCH before write – fail closed on incomplete manual routing.
 * Does not hit live partner APIs (keeps admin saves fast); schema + flag consistency only.
 */
export function preflightCorridorRoutingPatch(input: {
  providerRouting?: unknown
  metadata?: unknown
  fieldsSchema?: unknown
  /** Existing row used when patch omits a field. */
  existing?: {
    provider_routing?: unknown
    metadata?: unknown
    fields_schema?: unknown
  } | null
}): CorridorRoutingPreflightIssue[] {
  const routing = parseRouting(
    input.providerRouting !== undefined
      ? input.providerRouting
      : input.existing?.provider_routing,
  )
  // PATCH replaces metadata wholesale – do not merge with existing or deleted keys reappear.
  const metadata =
    input.metadata !== undefined
      ? ((input.metadata as Record<string, unknown> | null) ?? {})
      : ((input.existing?.metadata as Record<string, unknown> | null | undefined) ?? {})
  const fieldsSchema =
    input.fieldsSchema !== undefined ? input.fieldsSchema : input.existing?.fields_schema
  const routingPatch = input.providerRouting !== undefined

  const issues: CorridorRoutingPreflightIssue[] = []

  // Empty routing = payout disabled – allowed.
  if (routing.length === 0) {
    if (routingPatch) {
      const payIn = String(metadata.pay_in_provider ?? "").trim().toLowerCase()
      if (payIn === "yellowcard" && metadata.yc_receive_enabled !== true && metadata.yc_receive === true) {
        issues.push({
          code: "RECEIVE_FLAG_DISABLED",
          message: "Yellowcard pay-in is selected but yc_receive_enabled is not true.",
        })
      }
    }
    return issues
  }

  const primary = resolvePrimaryPayoutProvider(routing)
  if (!["noah", "yellowcard", "grid"].includes(primary)) {
    issues.push({
      code: "PROVIDER_UNKNOWN",
      message: `Unknown primary payout provider: ${primary}`,
    })
    return issues
  }

  // Only enforce routing ↔ send-flag alignment when Office is actively changing routing.
  if (routingPatch) {
    if (primary === "yellowcard" && metadata.yc_send_enabled === false) {
      issues.push({
        code: "SEND_FLAG_DISABLED",
        message: "Yellowcard is primary payout but yc_send_enabled is false.",
      })
    }
    if (primary === "grid" && metadata.grid_send_enabled === false) {
      issues.push({
        code: "SEND_FLAG_DISABLED",
        message: "Grid is primary payout but grid_send_enabled is false.",
      })
    }
    if (primary === "noah" && metadata.noah_send_enabled === false) {
      issues.push({
        code: "SEND_FLAG_DISABLED",
        message: "Noah is primary payout but noah_send_enabled is false.",
      })
    }
  }

  if (!schemaReadyForProvider(fieldsSchema, primary)) {
    // Only block when Office is actively setting payout routing – metadata-only
    // patches should not trap corridors that still need a Sync.
    if (routingPatch) {
      issues.push({
        code: "SCHEMA_PENDING",
        message: `fields_schema for ${primary} is missing or pending. Run Sync corridors before enabling this provider.`,
      })
    }
  }

  if (routingPatch) {
    const payIn = String(metadata.pay_in_provider ?? "").trim().toLowerCase()
    if (payIn === "yellowcard" && metadata.yc_receive_enabled === false) {
      issues.push({
        code: "RECEIVE_FLAG_DISABLED",
        message: "pay_in_provider is yellowcard but yc_receive_enabled is false.",
      })
    }
    if (payIn === "grid" && metadata.grid_receive_enabled === false) {
      issues.push({
        code: "RECEIVE_FLAG_DISABLED",
        message: "pay_in_provider is grid but grid_receive_enabled is false.",
      })
    }
    if (payIn === "noah" && metadata.noah_receive_enabled === false) {
      issues.push({
        code: "RECEIVE_FLAG_DISABLED",
        message: "pay_in_provider is noah but noah_receive_enabled is false.",
      })
    }
  }

  return issues
}

/** Load existing corridor row for preflight merge. */
export async function loadCorridorForPreflight(
  admin: SupabaseClient,
  id: string,
): Promise<{
  provider_routing?: unknown
  metadata?: unknown
  fields_schema?: unknown
} | null> {
  const { data } = await admin
    .from("payout_corridors")
    .select("provider_routing,metadata,fields_schema")
    .eq("id", id)
    .maybeSingle()
  return data ?? null
}
