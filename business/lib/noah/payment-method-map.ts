/** Shared Noah payment-method → display + DB mapping (virtual-accounts, persist, create-accounts). */

import {
  formatVaAccountHolderName,
  formatVaBankAddress,
  formatVaBankName,
} from "./format-display-text"
import { extractIssuerBankDetails } from "./extract-issuer-bank-details"

export function isEurCountry(code: string): boolean {
  const eu = new Set([
    "AT",
    "BE",
    "BG",
    "HR",
    "CY",
    "CZ",
    "DK",
    "EE",
    "FI",
    "FR",
    "DE",
    "GR",
    "HU",
    "IE",
    "IT",
    "LV",
    "LT",
    "LU",
    "MT",
    "NL",
    "PL",
    "PT",
    "RO",
    "SK",
    "SI",
    "ES",
    "SE",
    "IS",
    "LI",
    "NO",
    "CH",
  ])
  return eu.has(code.toUpperCase())
}

function pmFiatCurrency(pm: Record<string, unknown>): string {
  return String(pm.FiatCurrency ?? pm.fiatCurrency ?? "").toUpperCase()
}

function pmEntity(pm: Record<string, unknown>): string {
  return String(pm.Entity ?? pm.entity ?? "").toUpperCase()
}

function pmId(pm: Record<string, unknown>): string {
  return String(pm.ID ?? pm.PaymentMethodID ?? "").trim()
}

/** Currency from Noah `PaymentMethodID` (`Bank/Ach/USD/...`) when `FiatCurrency` is omitted. */
export function parseCurrencyFromNoahPaymentMethodId(
  pm: Record<string, unknown>,
): "usd" | "eur" | "gbp" | null {
  const id = pmId(pm).toUpperCase()
  const m = id.match(/\/(ACH|WIRE|FEDWIRE|SWIFT|SEPA)\/(USD|EUR|GBP)\//)
  if (!m) return null
  const cur = m[2]
  if (cur === "USD") return "usd"
  if (cur === "EUR") return "eur"
  if (cur === "GBP") return "gbp"
  return null
}

/** Bank deposit rail encoded in Noah payment method id (PayinTo fiat VAs). */
export function isNoahBankPayinPaymentMethod(pm: Record<string, unknown>): boolean {
  const id = pmId(pm).toLowerCase()
  if (!id.startsWith("bank/")) return false
  return (
    id.includes("/ach/") ||
    id.includes("/wire/") ||
    id.includes("/fedwire/") ||
    id.includes("/swift/") ||
    id.includes("/sepa/")
  ) && parseCurrencyFromNoahPaymentMethodId(pm) != null
}

function isPayinToExplicitlyDisabled(pm: Record<string, unknown>): boolean {
  if (isNoahBankPayinPaymentMethod(pm)) return false
  const caps = pm.Capabilities as Record<string, unknown> | undefined
  return caps?.PayinTo === false || caps?.payinTo === false
}

export function matchesCurrency(pm: Record<string, unknown>, want: "usd" | "eur" | "gbp"): boolean {
  const fromId = parseCurrencyFromNoahPaymentMethodId(pm)
  if (fromId === want) return true

  const country = String(pm.Country ?? "").toUpperCase()
  const fiat = pmFiatCurrency(pm)
  const entity = pmEntity(pm)

  if (want === "usd") {
    return country === "US" || fiat === "USD" || entity === "US"
  }
  if (want === "eur") {
    return isEurCountry(country) || fiat === "EUR" || entity === "LT"
  }
  if (want === "gbp") {
    return country === "GB" || fiat === "GBP"
  }
  return false
}

export function hasPayinBank(pm: Record<string, unknown>, country: string): boolean {
  if (isPayinToExplicitlyDisabled(pm)) return false
  const want = country.toUpperCase()
  const fromId = parseCurrencyFromNoahPaymentMethodId(pm)
  if (want === "US" && fromId === "usd" && isNoahBankPayinPaymentMethod(pm)) return true
  if (want === "GB" && fromId === "gbp" && isNoahBankPayinPaymentMethod(pm)) return true
  if (String(pm.Country ?? "").toUpperCase() === want) return true
  if (want === "US") return pmFiatCurrency(pm) === "USD" || pmEntity(pm) === "US"
  if (want === "GB") return pmFiatCurrency(pm) === "GBP"
  return false
}

export type VirtualAccountDisplay = {
  hasAccount: boolean
  currency: "usd" | "eur" | "gbp"
  accountNumber?: string
  routingNumber?: string
  /** UK Faster Payments — often mapped from `routingNumber` in API responses */
  sortCode?: string
  iban?: string
  bic?: string
  bankName?: string
  bankAddress?: string
  accountHolderName?: string
  status: string
}

export type NoahBankRail = "ach" | "wire" | "swift" | "sepa" | "unknown"

/** Parse rail from Noah `PaymentMethodID` (`Bank/Ach/USD/...`) or `PaymentMethodType`. */
export function parseNoahPaymentMethodRail(pm: Record<string, unknown>): NoahBankRail {
  const id = String(pm.ID ?? pm.PaymentMethodID ?? "").trim().toLowerCase()
  const type = String(pm.PaymentMethodType ?? "").trim().toLowerCase()

  if (id.includes("/ach/") || type === "bankach") return "ach"
  if (id.includes("/wire/") || id.includes("/fedwire/") || type.includes("wire")) return "wire"
  if (id.includes("/swift/") || type === "bankswift") return "swift"
  if (id.includes("/sepa/") || type.includes("sepa")) return "sepa"
  return "unknown"
}

export function isUsAbaRoutingNumber(code: string | null | undefined): boolean {
  if (!code) return false
  const digits = code.replace(/\D/g, "")
  return digits.length === 9
}

export function looksLikeSwiftBic(code: string | null | undefined): boolean {
  if (!code) return false
  const c = code.replace(/\s/g, "").toUpperCase()
  if (isUsAbaRoutingNumber(c)) return false
  return /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(c)
}

export type NoahBankFieldColumns = {
  accountNumber: string | null
  routingNumber: string | null
  iban: string | null
  /** SEPA BIC (EUR) or SWIFT BIC on USD SWIFT rows. */
  bic: string | null
  sortCode: string | null
}

/** Map Noah bank account + bank code into `virtual_accounts` columns by currency and rail. */
export function mapNoahBankFieldsToColumns(
  currency: "usd" | "eur" | "gbp",
  rail: NoahBankRail,
  accountNumber: string | null,
  bankCode: string | null,
): NoahBankFieldColumns {
  const acct = accountNumber?.trim() || null
  const code = bankCode?.trim() || null

  if (currency === "eur") {
    return {
      accountNumber: null,
      routingNumber: null,
      iban: acct,
      bic: code,
      sortCode: null,
    }
  }

  if (currency === "gbp") {
    return {
      accountNumber: acct,
      routingNumber: null,
      iban: null,
      bic: null,
      sortCode: code,
    }
  }

  // USD SWIFT: BIC in `bic`; ACH/Wire: ABA in `routing_number`.
  if (rail === "swift" || looksLikeSwiftBic(code)) {
    return {
      accountNumber: acct,
      routingNumber: null,
      iban: null,
      bic: code,
      sortCode: null,
    }
  }

  return {
    accountNumber: acct,
    routingNumber: code,
    iban: null,
    bic: null,
    sortCode: null,
  }
}

/** Prefer ACH, then Wire/Fedwire; never use SWIFT for primary USD receive details. */
export function selectPreferredUsdPayinPaymentMethod(
  paymentMethods: Record<string, unknown>[],
): Record<string, unknown> | undefined {
  const usdPayin = paymentMethods.filter(
    (pm) => hasPayinBank(pm, "US") || parseCurrencyFromNoahPaymentMethodId(pm) === "usd",
  )
  const pick = (rail: NoahBankRail) => usdPayin.find((pm) => parseNoahPaymentMethodRail(pm) === rail)
  return pick("ach") ?? pick("wire")
}

/** True when any USD PayinTo bank PM exists (ACH/Wire/SWIFT), for provisioning diagnostics. */
export function hasUsdPayinBankMethods(paymentMethods: Record<string, unknown>[]): boolean {
  return paymentMethods.some(
    (pm) => hasPayinBank(pm, "US") || parseCurrencyFromNoahPaymentMethodId(pm) === "usd",
  )
}

export type MergedUsdVirtualAccountFields = {
  canonicalPmId: string
  accountNumber: string | null
  routingNumber: string | null
  bic: string | null
  bankName: string | null
  bankAddress: string | null
  accountHolderName: string | null
}

export function isFiatBankDisplayPaymentMethod(pm: Record<string, unknown>): boolean {
  const type = String((pm.DisplayDetails as Record<string, unknown> | undefined)?.Type ?? "")
  return !type || type === "FiatPaymentMethodBankDisplay"
}

export function filterUsdPayinBankPaymentMethods(
  paymentMethods: Record<string, unknown>[],
): Record<string, unknown>[] {
  return paymentMethods.filter(
    (pm) =>
      isFiatBankDisplayPaymentMethod(pm) &&
      (hasPayinBank(pm, "US") || parseCurrencyFromNoahPaymentMethodId(pm) === "usd"),
  )
}

function coalesceNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return null
}

/** Merge partial USD VA snapshots (DB row + Noah PMs). */
export function mergeUsdVirtualAccountFieldPartials(
  ...partials: Array<Partial<MergedUsdVirtualAccountFields>>
): MergedUsdVirtualAccountFields | null {
  const canonicalPmId = coalesceNonEmpty(...partials.map((p) => p.canonicalPmId))
  if (!canonicalPmId) return null
  return {
    canonicalPmId,
    accountNumber: coalesceNonEmpty(...partials.map((p) => p.accountNumber)),
    routingNumber: coalesceNonEmpty(...partials.map((p) => p.routingNumber)),
    bic: coalesceNonEmpty(...partials.map((p) => p.bic)),
    bankName: coalesceNonEmpty(...partials.map((p) => p.bankName)),
    bankAddress: coalesceNonEmpty(...partials.map((p) => p.bankAddress)),
    accountHolderName: coalesceNonEmpty(...partials.map((p) => p.accountHolderName)),
  }
}

/**
 * One USD virtual account row: account_number from any rail; routing from ACH/Wire; BIC from SWIFT.
 * `canonicalPmId` is the preferred ACH (then Wire) PaymentMethodID stored on users/businesses.
 */
export function mergeUsdPayinPaymentMethods(
  paymentMethods: Record<string, unknown>[],
): MergedUsdVirtualAccountFields | null {
  const usdPms = filterUsdPayinBankPaymentMethods(paymentMethods)
  if (!usdPms.length) return null

  let accountNumber: string | null = null
  let routingNumber: string | null = null
  let bic: string | null = null
  let bankName: string | null = null
  let bankAddress: string | null = null
  let accountHolderName: string | null = null

  const bankNames: Array<string | null> = []
  const bankAddresses: Array<string | null> = []

  for (const pm of usdPms) {
    const rail = parseNoahPaymentMethodRail(pm)
    const display = mapPaymentMethodToVirtualAccountDisplay(pm, "usd")
    const issuer = extractIssuerBankDetails(pm)
    const details = pm.DisplayDetails as Record<string, unknown> | undefined
    const acct = details?.AccountNumber != null ? String(details.AccountNumber).trim() : null
    const bankCode = details?.BankCode != null ? String(details.BankCode).trim() : null
    const cols = mapNoahBankFieldsToColumns("usd", rail, acct, bankCode)

    accountNumber = accountNumber ?? cols.accountNumber
    if (rail === "ach" || rail === "wire") {
      routingNumber = routingNumber ?? cols.routingNumber
    }
    if (rail === "swift") {
      bic = bic ?? cols.bic
    }
    bankNames.push(issuer.bankName, display.bankName ?? null)
    bankAddresses.push(issuer.bankAddress, display.bankAddress ?? null)
    accountHolderName = accountHolderName ?? display.accountHolderName ?? null
  }

  bankName = coalesceNonEmpty(...bankNames)
  bankAddress = coalesceNonEmpty(...bankAddresses)

  const preferred = selectPreferredUsdPayinPaymentMethod(usdPms)
  const canonicalPmId = String(
    preferred?.ID ?? preferred?.PaymentMethodID ?? usdPms[0]?.ID ?? "",
  ).trim()
  if (!canonicalPmId) return null

  if (preferred) {
    const d = mapPaymentMethodToVirtualAccountDisplay(preferred, "usd")
    const issuer = extractIssuerBankDetails(preferred)
    bankName = coalesceNonEmpty(issuer.bankName, d.bankName, bankName)
    bankAddress = coalesceNonEmpty(issuer.bankAddress, d.bankAddress, bankAddress)
    accountHolderName = coalesceNonEmpty(d.accountHolderName, accountHolderName)
  }

  return {
    canonicalPmId,
    accountNumber,
    routingNumber,
    bic,
    bankName,
    bankAddress,
    accountHolderName,
  }
}

export function selectPreferredEurPayinPaymentMethod(
  paymentMethods: Record<string, unknown>[],
): Record<string, unknown> | undefined {
  const eurPayin = paymentMethods.filter((pm) => {
    if (isPayinToExplicitlyDisabled(pm)) return false
    return matchesCurrency(pm, "eur")
  })
  const sepa = eurPayin.find((pm) => parseNoahPaymentMethodRail(pm) === "sepa")
  return sepa ?? eurPayin[0]
}

export function mapPaymentMethodToVirtualAccountDisplay(
  pm: Record<string, unknown>,
  currency: "usd" | "eur" | "gbp",
): VirtualAccountDisplay {
  const details = pm.DisplayDetails as Record<string, unknown> | undefined
  const issuer = extractIssuerBankDetails(pm)
  const holder = pm.AccountHolderDetails as { Name?: { FirstName?: string; LastName?: string } } | undefined

  const type = String(details?.Type ?? "")
  let accountNumber: string | undefined
  let routingNumber: string | undefined
  let iban: string | undefined
  let bic: string | undefined
  if (type === "FiatPaymentMethodBankDisplay") {
    accountNumber = details?.AccountNumber != null ? String(details.AccountNumber) : undefined
    const bankCode = details?.BankCode != null ? String(details.BankCode) : undefined
    const rail = parseNoahPaymentMethodRail(pm)
    const cols = mapNoahBankFieldsToColumns(currency, rail, accountNumber ?? null, bankCode ?? null)
    accountNumber = cols.accountNumber ?? undefined
    routingNumber = cols.routingNumber ?? undefined
    iban = cols.iban ?? undefined
    bic = cols.bic ?? undefined
  }

  const holderName = holder?.Name as
    | { FirstName?: string; MiddleName?: string; LastName?: string }
    | undefined
  const holderParts = [
    holderName?.FirstName,
    holderName?.MiddleName,
    holderName?.LastName,
  ]
    .map((p) => (p != null ? String(p).trim() : ""))
    .filter(Boolean)
  const accountHolderName = holderParts.length ? holderParts.join(" ") : undefined

  const sortCode = currency === "gbp" && routingNumber ? routingNumber : undefined

  return {
    hasAccount: true,
    currency,
    accountNumber,
    routingNumber,
    sortCode,
    iban,
    bic,
    bankName: formatVaBankName(issuer.bankName) ?? undefined,
    bankAddress: formatVaBankAddress(issuer.bankAddress) ?? undefined,
    accountHolderName: formatVaAccountHolderName(accountHolderName) ?? undefined,
    status: "active",
  }
}
