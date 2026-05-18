/** Shared Noah payment-method → display + DB mapping (virtual-accounts, persist, create-accounts). */

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

export function matchesCurrency(pm: Record<string, unknown>, want: "usd" | "eur" | "gbp"): boolean {
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
  const caps = pm.Capabilities as Record<string, unknown> | undefined
  if (caps && caps.PayinTo === false) return false
  const want = country.toUpperCase()
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

export function mapPaymentMethodToVirtualAccountDisplay(
  pm: Record<string, unknown>,
  currency: "usd" | "eur" | "gbp",
): VirtualAccountDisplay {
  const details = pm.DisplayDetails as Record<string, unknown> | undefined
  const issuer = pm.IssuerDetails as { Name?: string; Address?: string } | undefined
  const holder = pm.AccountHolderDetails as { Name?: { FirstName?: string; LastName?: string } } | undefined

  const type = String(details?.Type ?? "")
  let accountNumber: string | undefined
  let routingNumber: string | undefined
  let iban: string | undefined
  let bic: string | undefined

  if (type === "FiatPaymentMethodBankDisplay") {
    accountNumber = details?.AccountNumber != null ? String(details.AccountNumber) : undefined
    const bankCode = details?.BankCode != null ? String(details.BankCode) : undefined
    if (currency === "usd") {
      routingNumber = bankCode
    } else if (currency === "gbp") {
      routingNumber = bankCode
    } else {
      iban = accountNumber
      bic = bankCode
    }
  }

  const accountHolderName =
    holder?.Name?.FirstName || holder?.Name?.LastName
      ? `${holder?.Name?.FirstName ?? ""} ${holder?.Name?.LastName ?? ""}`.trim()
      : undefined

  const sortCode = currency === "gbp" && routingNumber ? routingNumber : undefined

  return {
    hasAccount: true,
    currency,
    accountNumber,
    routingNumber,
    sortCode,
    iban,
    bic,
    bankName: issuer?.Name,
    bankAddress: issuer?.Address,
    accountHolderName,
    status: "active",
  }
}
