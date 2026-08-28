import type { PayoutProviderId } from "./payout-corridor"

/** Stored on recipient.transfer_type for EUR bank corridors. */
export type EurBankTransferType = "SEPA Instant" | "SEPA"

/** Grid quote destination.paymentRail for a EUR_ACCOUNT. */
export type GridEurPaymentRail = "SEPA" | "SEPA_INSTANT"

/** Timing chip on EUR transfer-type tiles (title stays "SEPA" for both). */
export const EUR_BANK_TRANSFER_SPEED_LABEL: Record<EurBankTransferType, string> = {
  "SEPA Instant": "Instant",
  SEPA: "1–3 days",
}

/** Short tile title; stored transfer_type keeps full "SEPA Instant" / "SEPA". */
export const EUR_BANK_TRANSFER_TILE_LABEL: Record<EurBankTransferType, string> = {
  "SEPA Instant": "SEPA",
  SEPA: "SEPA",
}

export type EurBankTransferMethodOption = {
  value: EurBankTransferType
  label: string
  speedLabel: string
}

const GRID_METHODS: EurBankTransferMethodOption[] = [
  {
    value: "SEPA Instant",
    label: EUR_BANK_TRANSFER_TILE_LABEL["SEPA Instant"],
    speedLabel: EUR_BANK_TRANSFER_SPEED_LABEL["SEPA Instant"],
  },
  {
    value: "SEPA",
    label: EUR_BANK_TRANSFER_TILE_LABEL.SEPA,
    speedLabel: EUR_BANK_TRANSFER_SPEED_LABEL.SEPA,
  },
]

const NOAH_METHODS: EurBankTransferMethodOption[] = [...GRID_METHODS]

export const EUR_BANK_TRANSFER_TYPES: EurBankTransferType[] = ["SEPA Instant", "SEPA"]

export function parseEurBankTransferType(value: unknown): EurBankTransferType | null {
  const raw = String(value ?? "").trim()
  if (raw === "SEPA Instant" || raw === "SEPA") return raw
  const upper = raw.toUpperCase().replace(/[\s_-]+/g, "_")
  if (upper === "SEPA_INSTANT" || upper === "SEPAINSTANT") return "SEPA Instant"
  if (upper === "SEPA") return "SEPA"
  return null
}

export function eurBankPaymentMethodsForProvider(
  provider: PayoutProviderId | null | undefined,
): EurBankTransferMethodOption[] {
  if (provider === "grid") return GRID_METHODS
  if (provider === "noah") return NOAH_METHODS
  return []
}

export function toGridEurPaymentRail(
  transferType: EurBankTransferType | null | undefined,
): GridEurPaymentRail {
  if (transferType === "SEPA") return "SEPA"
  return "SEPA_INSTANT"
}

/** Default SEPA Instant when unset or invalid for the provider. */
export function coerceEurTransferTypeForProvider(
  value: unknown,
  provider: PayoutProviderId | null | undefined,
): EurBankTransferType {
  const parsed = parseEurBankTransferType(value) ?? "SEPA Instant"
  const allowed = eurBankPaymentMethodsForProvider(provider)
  if (allowed.some((option) => option.value === parsed)) return parsed
  return allowed[0]?.value ?? "SEPA Instant"
}

export function noahEurPrefersInstant(value: unknown): boolean {
  return coerceEurTransferTypeForProvider(value, "noah") !== "SEPA"
}
