import { mapResidenceToLocalPayInCurrency } from "./yc-fund-balance-errors"
import {
  isStripeOnrampPayerEligible,
  stripeOnrampAchAvailable,
} from "./stripe-onramp-geo"

export type CashPayInProduct = "mobile" | "business"

export type CashPayInMethodKind =
  | "va_bank"
  | "local_bank"
  | "local_momo"
  | "express_card"
  | "express_apple_pay"
  | "express_google_pay"
  | "express_ach"

export type CashPayInMethodStatus = "available" | "setup_required" | "hidden"

export type CashPayInMethod = {
  kind: CashPayInMethodKind
  status: CashPayInMethodStatus
  country?: string
  currency?: string
  titleKey: string
}

export type CashPayInOfficeFlags = {
  stripeOnrampEnabled: boolean
  stripeOnrampEuEnabled: boolean
}

export type CashPayInDeviceWallets = {
  applePay?: boolean
  googlePay?: boolean
}

export type ResolveCashPayInMethodsInput = {
  product: CashPayInProduct
  ledgerCurrency: "USD" | "EUR"
  payerCountry?: string | null
  payerState?: string | null
  businessCountry?: string | null
  tier1Complete: boolean
  expressDepositsReady: boolean
  deviceWallets?: CashPayInDeviceWallets
  officeFlags: CashPayInOfficeFlags
  localBankAvailable?: boolean
  localMomoAvailable?: boolean
  showVaBank?: boolean
}

export function localPayInCountries(input: {
  payerCountry?: string | null
  businessCountry?: string | null
}): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [input.payerCountry, input.businessCountry]) {
    const cc = String(raw ?? "").trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(cc) || seen.has(cc)) continue
    seen.add(cc)
    out.push(cc)
  }
  return out
}

export function resolveCashPayInMethods(input: ResolveCashPayInMethodsInput): CashPayInMethod[] {
  const methods: CashPayInMethod[] = []

  if (input.showVaBank !== false && (input.ledgerCurrency === "USD" || input.ledgerCurrency === "EUR")) {
    methods.push({
      kind: "va_bank",
      status: input.tier1Complete ? "available" : "setup_required",
      currency: input.ledgerCurrency,
      titleKey: "va_bank",
    })
  }

  if (input.ledgerCurrency === "USD") {
    const countries = localPayInCountries({
      payerCountry: input.payerCountry,
      businessCountry: input.product === "business" ? input.businessCountry : null,
    })
    for (const country of countries) {
      const currency = mapResidenceToLocalPayInCurrency(country) ?? undefined
      if (input.localBankAvailable !== false) {
        methods.push({
          kind: "local_bank",
          status: input.tier1Complete ? "available" : "setup_required",
          country,
          currency,
          titleKey: "local_bank",
        })
      }
      if (input.localMomoAvailable) {
        methods.push({
          kind: "local_momo",
          status: input.tier1Complete ? "available" : "setup_required",
          country,
          currency,
          titleKey: "local_momo",
        })
      }
    }
  }

  const stripeGeo = isStripeOnrampPayerEligible({
    country: input.payerCountry,
    state: input.payerState,
    euEnabled: input.officeFlags.stripeOnrampEuEnabled,
  })
  const stripeOffice = input.officeFlags.stripeOnrampEnabled && stripeGeo
  if (stripeOffice && input.ledgerCurrency === "USD") {
    const status: CashPayInMethodStatus =
      !input.tier1Complete || !input.expressDepositsReady ? "setup_required" : "available"
    methods.push({ kind: "express_card", status, titleKey: "express_card" })
    if (input.deviceWallets?.applePay !== false) {
      methods.push({ kind: "express_apple_pay", status, titleKey: "express_apple_pay" })
    }
    if (input.deviceWallets?.googlePay !== false) {
      methods.push({ kind: "express_google_pay", status, titleKey: "express_google_pay" })
    }
    if (
      stripeOnrampAchAvailable({
        country: input.payerCountry,
        state: input.payerState,
        euEnabled: input.officeFlags.stripeOnrampEuEnabled,
      })
    ) {
      methods.push({ kind: "express_ach", status, titleKey: "express_ach" })
    }
  }

  return methods
}
