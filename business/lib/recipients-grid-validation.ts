import type { SupabaseClient } from "@supabase/supabase-js"
import {
  mapCadRoutingToGridMetadata,
  normalizeRecipientYcMetadata,
  resolveGridCorridorSchema,
  resolvePrimaryPayoutProvider,
  validateGridRecipientForCorridor,
  type ProviderRoutingEntry,
} from "@easner/shared"
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
    .select("fields_schema,provider_routing")
    .eq("country_code", cc)
    .eq("currency_code", cur)
    .eq("rail", rail)
    .maybeSingle()

  const payoutProvider = resolvePrimaryPayoutProvider(
    corridor?.provider_routing as ProviderRoutingEntry[] | null | undefined,
  )
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
