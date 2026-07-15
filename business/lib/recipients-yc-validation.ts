import type { SupabaseClient } from "@supabase/supabase-js"
import {
  normalizeRecipientYcMetadata,
  resolveYcCorridorSchema,
  unwrapNoahFieldsSchema,
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
    .select("fields_schema")
    .eq("country_code", cc)
    .eq("currency_code", cur)
    .eq("rail", rail)
    .maybeSingle()

  const ycSchema = resolveYcCorridorSchema({
    countryCode: cc,
    currencyCode: cur,
    fieldsSchema: corridor?.fields_schema,
  })
  if (!ycSchema || ycSchema.status !== "ready") return null

  const bankEnum = ycSchema.bank_enum?.length
    ? ycSchema.bank_enum
    : unwrapNoahFieldsSchema(corridor?.fields_schema)?.bank_enum

  if (
    !isMobile &&
    Array.isArray(bankEnum) &&
    bankEnum.length > 0 &&
    payload.bank_name?.trim() &&
    !bankEnum.includes(payload.bank_name.trim())
  ) {
    return "Bank must be selected from the corridor list."
  }

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
