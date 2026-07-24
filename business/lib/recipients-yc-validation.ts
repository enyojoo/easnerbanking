import type { SupabaseClient } from "@supabase/supabase-js"
import {
  isBankNameAllowedForCorridor,
  isMomoProviderAllowedForCorridor,
  normalizeRecipientYcMetadata,
  resolveCorridorRecipientOptions,
  resolveYcCorridorSchema,
  validateYcRecipientForCorridor,
} from "@easner/shared"
import type { RecipientWritePayload } from "@/lib/recipients-write-payload"

export async function validateRecipientYcExtrasForSave(
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
    .select("fields_schema,providers")
    .eq("country_code", cc)
    .eq("currency_code", cur)
    .eq("rail", rail)
    .maybeSingle()

  const recipientOptions = resolveCorridorRecipientOptions({
    countryCode: cc,
    currencyCode: cur,
    rail,
    fieldsSchema: corridor?.fields_schema,
    providers: corridor?.providers,
  })

  if (
    !isMobile &&
    payload.bank_name?.trim() &&
    !isBankNameAllowedForCorridor(payload.bank_name.trim(), recipientOptions)
  ) {
    return "Bank must be selected from the corridor list."
  }

  if (
    isMobile &&
    payload.mobile_provider?.trim() &&
    !isMomoProviderAllowedForCorridor(payload.mobile_provider.trim(), recipientOptions)
  ) {
    return "Mobile money provider must be selected from the corridor list."
  }

  const ycSchema = resolveYcCorridorSchema({
    countryCode: cc,
    currencyCode: cur,
    fieldsSchema: corridor?.fields_schema,
  })
  if (!ycSchema || ycSchema.status !== "ready") return null

  const check = validateYcRecipientForCorridor({
    countryCode: cc,
    currencyCode: cur,
    fieldsSchema: corridor?.fields_schema,
    row: {
      country_code: cc,
      currency: cur,
      full_name: payload.full_name,
      account_number: payload.account_number,
      bank_name: payload.bank_name,
      phone_number: payload.phone_number,
      mobile_provider: payload.mobile_provider,
      checking_or_savings: payload.checking_or_savings,
      metadata: normalizeRecipientYcMetadata(payload.metadata),
    },
  })

  return check.ok ? null : check.message
}
