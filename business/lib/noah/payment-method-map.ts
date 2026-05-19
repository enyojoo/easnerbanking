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

/** Prefer ACH, then Wire; never use SWIFT for primary USD receive details. */
export function selectPreferredUsdPayinPaymentMethod(
  paymentMethods: Record<string, unknown>[],
): Record<string, unknown> | undefined {
  const usdPayin = paymentMethods.filter((pm) => hasPayinBank(pm, "US"))
  const pick = (rail: NoahBankRail) => usdPayin.find((pm) => parseNoahPaymentMethodRail(pm) === rail)
  return pick("ach") ?? pick("wire")
}

export function selectPreferredEurPayinPaymentMethod(
  paymentMethods: Record<string, unknown>[],
): Record<string, unknown> | undefined {
  const eurPayin = paymentMethods.filter((pm) => {
    const caps = pm.Capabilities as Record<string, unknown> | undefined
    if (caps && caps.PayinTo === false) return false
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
    const rail = parseNoahPaymentMethodRail(pm)
    const cols = mapNoahBankFieldsToColumns(currency, rail, accountNumber ?? null, bankCode ?? null)
    accountNumber = cols.accountNumber ?? undefined
    routingNumber = cols.routingNumber ?? undefined
    iban = cols.iban ?? undefined
    bic = cols.bic ?? undefined
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
