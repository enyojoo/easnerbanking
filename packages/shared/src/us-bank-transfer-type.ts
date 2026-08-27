import type { PayoutProviderId } from "./payout-corridor"

/** Stored on recipient.transfer_type. `Wire` is Noah Fedwire and Grid WIRE. */
export type UsBankTransferType = "ACH" | "Wire" | "RTP" | "FEDNOW"

/** Grid quote destination.paymentRail for a USD_ACCOUNT. */
export type GridUsPaymentRail = "ACH" | "WIRE" | "RTP" | "FEDNOW"

export type UsBankTransferMethodOption = {
  value: UsBankTransferType
  label: string
}

const GRID_METHODS: UsBankTransferMethodOption[] = [
  { value: "ACH", label: "ACH" },
  { value: "Wire", label: "Wire" },
  { value: "RTP", label: "RTP" },
  { value: "FEDNOW", label: "FedNow" },
]

const NOAH_METHODS: UsBankTransferMethodOption[] = [
  { value: "ACH", label: "ACH" },
  { value: "Wire", label: "Wire" },
]

export const US_BANK_TRANSFER_TYPES: UsBankTransferType[] = [
  "ACH",
  "Wire",
  "RTP",
  "FEDNOW",
]

export function parseUsBankTransferType(value: unknown): UsBankTransferType | null {
  const raw = String(value ?? "").trim()
  if (raw === "ACH" || raw === "Wire" || raw === "RTP" || raw === "FEDNOW") return raw
  const upper = raw.toUpperCase()
  if (upper === "ACH") return "ACH"
  if (upper === "WIRE" || upper === "FEDWIRE") return "Wire"
  if (upper === "RTP") return "RTP"
  if (upper === "FEDNOW" || upper === "FED_NOW") return "FEDNOW"
  return null
}

export function usBankPaymentMethodsForProvider(
  provider: PayoutProviderId | null | undefined,
): UsBankTransferMethodOption[] {
  if (provider === "grid") return GRID_METHODS
  if (provider === "noah") return NOAH_METHODS
  return []
}

export function toGridPaymentRail(
  transferType: UsBankTransferType | null | undefined,
): GridUsPaymentRail {
  if (transferType === "Wire") return "WIRE"
  if (transferType === "RTP") return "RTP"
  if (transferType === "FEDNOW") return "FEDNOW"
  return "ACH"
}

/** Noah only supports ACH / Wire. Instant rails fall back to ACH. */
export function coerceUsTransferTypeForProvider(
  value: unknown,
  provider: PayoutProviderId | null | undefined,
): UsBankTransferType {
  const parsed = parseUsBankTransferType(value) ?? "ACH"
  const allowed = usBankPaymentMethodsForProvider(provider)
  if (allowed.some((option) => option.value === parsed)) return parsed
  if (provider === "noah") return parsed === "Wire" ? "Wire" : "ACH"
  return allowed[0]?.value ?? "ACH"
}

export function noahUsPrefersAch(value: unknown): boolean {
  return coerceUsTransferTypeForProvider(value, "noah") !== "Wire"
}

/** Yellowcard has no US domestic ACH / Wire / RTP / FedNow send. */
export function yellowcardOffersDomesticBankPayout(
  countryCode: string,
  currencyCode: string,
  rail?: string,
): boolean {
  const railNorm = rail === "mobile_money" ? "mobile_money" : "bank_transfer"
  if (railNorm !== "bank_transfer") return true
  return (
    String(countryCode ?? "").trim().toUpperCase() !== "US" ||
    String(currencyCode ?? "").trim().toUpperCase() !== "USD"
  )
}
