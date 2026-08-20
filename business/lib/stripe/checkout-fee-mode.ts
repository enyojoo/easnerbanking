import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * How card/bank processing fees are split on checkout collections
 * (invoice Pay online, Payment Links, website embed).
 *
 * - merchant_net: customer pays the listed amount, merchant receives it minus processing.
 * - buyer_surcharge: customer pays listed + processing, merchant receives ~the listed amount.
 * - easner_absorbs: customer pays listed, merchant receives listed, Easner covers processing.
 *   Office-only – never selectable by a business.
 */
export type CheckoutFeeMode = "merchant_net" | "buyer_surcharge" | "easner_absorbs"

export const DEFAULT_CHECKOUT_FEE_MODE: CheckoutFeeMode = "merchant_net"

/** Modes a business may pick for itself in /checkout settings. */
export const BUSINESS_SELECTABLE_FEE_MODES: readonly CheckoutFeeMode[] = [
  "merchant_net",
  "buyer_surcharge",
]

/** Modes ops may force from the Office business profile. */
export const OFFICE_FEE_MODE_OVERRIDES: readonly CheckoutFeeMode[] = [
  "merchant_net",
  "buyer_surcharge",
  "easner_absorbs",
]

export function parseCheckoutFeeMode(raw: unknown): CheckoutFeeMode | null {
  const value = String(raw ?? "").trim().toLowerCase()
  return OFFICE_FEE_MODE_OVERRIDES.includes(value as CheckoutFeeMode)
    ? (value as CheckoutFeeMode)
    : null
}

export type ResolvedCheckoutFeeMode = {
  feeMode: CheckoutFeeMode
  /** Business choice, ignored while an override is set. */
  businessFeeMode: CheckoutFeeMode | null
  /** Office override – when present the business UI shows the mode as managed by Easner. */
  overrideFeeMode: CheckoutFeeMode | null
  overrideReason: string | null
}

/**
 * Office override wins over the business choice; merchant net is the fallback.
 */
export async function resolveCheckoutFeeMode(
  admin: SupabaseClient,
  businessId: string,
): Promise<ResolvedCheckoutFeeMode> {
  const [{ data: override }, { data: settings }] = await Promise.all([
    admin
      .from("business_checkout_fee_overrides")
      .select("fee_mode, reason")
      .eq("business_id", businessId)
      .maybeSingle(),
    admin
      .from("business_checkout_settings")
      .select("fee_mode")
      .eq("business_id", businessId)
      .maybeSingle(),
  ])

  const overrideFeeMode = parseCheckoutFeeMode(override?.fee_mode)
  const businessFeeMode = parseCheckoutFeeMode(settings?.fee_mode)
  const overrideReason =
    typeof override?.reason === "string" && override.reason.trim() ? override.reason.trim() : null

  return {
    feeMode: overrideFeeMode ?? businessFeeMode ?? DEFAULT_CHECKOUT_FEE_MODE,
    businessFeeMode,
    overrideFeeMode,
    overrideReason,
  }
}

export function checkoutFeeModeLabel(mode: CheckoutFeeMode): string {
  if (mode === "buyer_surcharge") return "Buyer surcharge"
  if (mode === "easner_absorbs") return "Easner absorbs fees"
  return "Merchant net"
}

/** Plain-language explanation shown to operators – no provider names. */
export function checkoutFeeModeDescription(mode: CheckoutFeeMode): string {
  if (mode === "buyer_surcharge") {
    return "The customer pays the listed amount plus the processing fee."
  }
  if (mode === "easner_absorbs") {
    return "Easner covers the processing fee on these payments."
  }
  return "You receive the listed amount minus the processing fee."
}
