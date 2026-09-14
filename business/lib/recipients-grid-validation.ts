import type { SupabaseClient } from "@supabase/supabase-js"
import {
  mapCadRoutingToGridMetadata,
  normalizeRecipientYcMetadata,
  resolveGridCorridorSchema,
  projectCorridorForSurface,
  resolvePrimaryPayoutProvider,
  validateGridRecipientForCorridor,
} from "@easner/shared"
import { loadUserRoutingSurface } from "@/lib/corridor-routing-surface"
import type { RecipientWritePayload } from "@/lib/recipients-write-payload"

export function applyCadRoutingToRecipientMetadata(payload: RecipientWritePayload): RecipientWritePayload {
  const cc = String(payload.country_code || "").trim().toUpperCase()
  const cur = String(payload.currency || "").trim().toUpperCase()
  if (cc !== "CA" || cur !== "CAD") return payload
  const metadata = mapCadRoutingToGridMetadata({
    routingNumber: payload.routing_number,
    sortCode: payload.sort_code,
    metadata: payload.metadata,
  })
  return { ...payload, metadata }
}

export async function validateRecipientGridExtrasForSave(
  admin: SupabaseClient,
  payload: RecipientWritePayload,
  userId?: string | null,
): Promise<string | null> {
  const cc = String(payload.country_code || "").trim().toUpperCase()
  const cur = String(payload.currency || "").trim().toUpperCase()
  const isMobile = Boolean(payload.mobile_provider)
  const bankLabel = String(payload.bank_name || "").toLowerCase()
  if (!cc || !cur || payload.wallet_network || bankLabel.includes("easetag") || bankLabel.includes("easenet")) {
    return null
  }

  const rail = isMobile ? "mobile_money" : "bank_transfer"
  const { data: corridor } = await admin
    .from("payout_corridors")
    .select("fields_schema,provider_routing,metadata")
    .eq("country_code", cc)
    .eq("currency_code", cur)
    .eq("rail", rail)
    .maybeSingle()

  const surface = await loadUserRoutingSurface(admin, userId)
  const projected = projectCorridorForSurface(
    { provider_routing: corridor?.provider_routing, metadata: corridor?.metadata },
    surface,
  )
  const payoutProvider = resolvePrimaryPayoutProvider(projected.provider_routing)
  const schema = resolveGridCorridorSchema({
    countryCode: cc,
    currencyCode: cur,
    fieldsSchema: corridor?.fields_schema,
  })
  const hasRequiredExtras = (schema?.extra_fields ?? []).some((field) => field.required)
  if (payoutProvider !== "grid" && !hasRequiredExtras) return null
  if (!schema || schema.status !== "ready") return null

  const mapped = applyCadRoutingToRecipientMetadata(payload)
  const check = validateGridRecipientForCorridor({
    countryCode: cc,
    currencyCode: cur,
    fieldsSchema: corridor?.fields_schema,
    row: {
      country_code: cc,
      currency: cur,
      full_name: mapped.full_name,
      account_number: mapped.account_number,
      bank_name: mapped.bank_name,
      phone_number: mapped.phone_number,
      mobile_provider: mapped.mobile_provider,
      checking_or_savings: mapped.checking_or_savings,
      metadata: normalizeRecipientYcMetadata(mapped.metadata),
    },
  })

  return check.ok ? null : check.message
}
