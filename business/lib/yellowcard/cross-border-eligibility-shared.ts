export type ThroughLocalCurrencyReason =
  | "receive_not_enabled"
  | "same_currency"
  | "corridor_disabled"
  | "recipient_not_yc"

export function mapResidenceToLocalCurrency(residence: string): string | null {
  const cc = residence.trim().toUpperCase()
  const map: Record<string, string> = {
    NG: "NGN",
    KE: "KES",
    GH: "GHS",
    ZA: "ZAR",
    UG: "UGX",
    TZ: "TZS",
    RW: "RWF",
    MX: "MXN",
    BR: "BRL",
    AR: "ARS",
    CO: "COP",
    CL: "CLP",
  }
  return map[cc] ?? null
}

export function resolveRecipientYcSendRail(recipient: {
  mobile_provider?: string | null
  bank_name?: string | null
}): "bank_transfer" | "mobile_money" {
  if (
    recipient.mobile_provider ||
    String(recipient.bank_name || "")
      .toLowerCase()
      .includes("mobile money")
  ) {
    return "mobile_money"
  }
  return "bank_transfer"
}
