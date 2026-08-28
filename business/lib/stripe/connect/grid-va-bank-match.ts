import type Stripe from "stripe"

export type GridVaBankSnapshot = {
  accountNumber?: string | null
  routingNumber?: string | null
  iban?: string | null
}

export type FiatPayoutCurrency = "usd" | "eur" | "gbp"

export function normalizeBankDigits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "")
}

export function last4Digits(value: string | null | undefined): string {
  const digits = normalizeBankDigits(value)
  return digits.length >= 4 ? digits.slice(-4) : digits
}

export function routingNumbersMatch(
  vaRouting: string | null | undefined,
  bankRouting: string | null | undefined,
): boolean {
  const a = normalizeBankDigits(vaRouting)
  const b = normalizeBankDigits(bankRouting)
  if (!a || !b) return true
  if (a === b) return true
  return a.slice(-4) === b.slice(-4)
}

export function gridVaMatchesBankAccount(
  va: GridVaBankSnapshot,
  fiat: FiatPayoutCurrency,
  bank: Pick<Stripe.BankAccount, "last4" | "routing_number">,
): boolean {
  const bankLast4 = last4Digits(bank.last4)
  if (!bankLast4) return false

  if (fiat === "usd") {
    return last4Digits(va.accountNumber) === bankLast4 && routingNumbersMatch(va.routingNumber, bank.routing_number)
  }

  if (fiat === "eur") {
    return last4Digits(va.iban) === bankLast4
  }

  return false
}

export function pickCanonicalGridVaBank<T extends { id: string; default_for_currency?: boolean | null }>(
  matching: T[],
  storedId?: string | null,
): T | null {
  if (matching.length === 0) return null
  const stored = storedId?.trim()
  if (stored) {
    const found = matching.find((bank) => bank.id === stored)
    if (found) return found
  }
  return matching.find((bank) => bank.default_for_currency) ?? matching[0] ?? null
}

export function stripeVaLinkIdempotencyKey(
  businessId: string,
  currency: string,
  fingerprint: string,
): string {
  return `connect_va_${businessId}_${currency.trim().toLowerCase()}_${fingerprint}`.slice(0, 255)
}

export function vaPayoutFingerprint(
  fiat: FiatPayoutCurrency,
  va: GridVaBankSnapshot,
  fallbackRouting?: string | null,
): string {
  if (fiat === "usd") {
    return `usd_${normalizeBankDigits(va.accountNumber)}_${normalizeBankDigits(va.routingNumber || fallbackRouting)}`
  }
  if (fiat === "eur") {
    return `eur_${normalizeBankDigits(va.iban)}`
  }
  return fiat
}

export function isDuplicateBankAccountError(error: unknown): boolean {
  const code =
    typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : ""
  if (code === "bank_account_exists") return true
  const message = error instanceof Error ? error.message : String(error ?? "")
  return /already exists|already been added/i.test(message)
}
