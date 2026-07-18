export type YcFundBalanceQuoteErrorCode =
  | "currency_country_required"
  | "yc_rate_unavailable"
  | "yc_corridor_disabled"
  | "yc_settlement_wallet_not_configured"
  | "yc_channel_missing"
  | "ng_local_verification_incomplete"
  | "kyc_metadata_incomplete"
  | "yc_receive_rejected"
  | "yc_amount_below_min"
  | "yc_amount_above_max"
  | "yc_omnibus_below_required"

/** User-facing copy for fund-balance quote failures (mobile + business). */
export function ycFundBalanceQuoteErrorMessage(
  code: string | undefined,
  fallback?: string,
): string {
  switch (code) {
    case "currency_country_required":
      return "Add your residence country in profile settings to use local pay-in."
    case "yc_rate_unavailable":
      return "Exchange rates are syncing for this currency. Try again in a few minutes."
    case "yc_corridor_disabled":
      return "Local pay-in is not enabled for this corridor yet."
    case "yc_settlement_wallet_not_configured":
      return "Local pay-in is temporarily unavailable. Please try again later or contact support."
    case "yc_channel_missing":
      return "This payment method is not available for your country. Try the other option."
    case "ng_local_verification_incomplete":
      return "Complete NIN and BVN verification before using NGN pay-in."
    case "kyc_metadata_incomplete":
      return "Complete your identity verification before using local pay-in."
    case "yc_amount_below_min":
    case "yc_amount_above_max":
      return fallback || "Amount is outside the allowed range for this deposit."
    case "yc_omnibus_below_required":
      return "Rates changed — go back and confirm again to refresh payment details."
    case "yc_receive_rejected":
      if (fallback?.toLowerCase().includes("disabled")) {
        return "This payment method is temporarily unavailable. Try again later or contact support."
      }
      if (fallback?.toLowerCase().includes("international format")) {
        return "Enter your mobile number without the country code — the + prefix is added automatically."
      }
      return fallback || "Could not create payment details. Check your amount and try again."
    default:
      return fallback || "Could not get payment details"
  }
}

/** Map residence country (ISO-2) to local pay-in fiat currency. */
export function mapResidenceToLocalPayInCurrency(countryCode: string): string | null {
  const cc = String(countryCode ?? "").trim().toUpperCase()
  const map: Record<string, string> = {
    NG: "NGN",
    KE: "KES",
    GH: "GHS",
    ZA: "ZAR",
    UG: "UGX",
    TZ: "TZS",
    MX: "MXN",
    BR: "BRL",
    AR: "ARS",
    CO: "COP",
    CL: "CLP",
    RW: "RWF",
  }
  return map[cc] ?? null
}
