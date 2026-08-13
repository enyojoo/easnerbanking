import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import { resolveRecipientPayoutCountry } from "@/lib/terminal/recipient-sell-prepare"
import { buildGridIdempotencyKey } from "./idempotency"
import { gridFetch } from "./http"
import type { GridExternalAccount } from "./types"
import type { GridPersonProfile } from "./kyc-metadata"
import {
  applyProviderBindingToRecipient,
  normalizeGridBankAccountNumber,
  normalizeRecipientYcMetadata,
  normalizeYcMomoPhone,
  resolveGridBankName,
  resolveGridMomoProvider,
  mapCadRoutingToGridMetadata,
  type GridMomoProviderOption,
} from "@easner/shared"

function currencyAccountType(currency: string): string {
  return `${currency.trim().toUpperCase()}_ACCOUNT`
}

const GRID_IBAN_CURRENCIES = new Set(["AED", "DKK"])
const GRID_MOMO_FIAT_CURRENCIES = new Set(["UGX", "RWF", "KES", "TZS", "MWK", "BWP", "ZMW", "XOF", "XAF"])

function gridUsesMomoAccountShape(input: {
  rail: "bank_transfer" | "mobile_money"
  currency: string
  mobileProvider?: string
  bankName?: string
}): boolean {
  if (input.rail === "mobile_money") return true
  if (input.mobileProvider) return true
  return GRID_MOMO_FIAT_CURRENCIES.has(input.currency) && !input.bankName
}

function beneficiaryFromRecipient(input: {
  recipient: RecipientSellPrepareRow
  profile?: GridPersonProfile
}): Record<string, unknown> {
  const name =
    String(input.recipient.full_name ?? input.profile?.fullName ?? "").trim() || "Beneficiary"
  const country = resolveRecipientPayoutCountry(input.recipient)?.toUpperCase()
  const phone = input.recipient.phone_number || input.profile?.phone
  return {
    beneficiaryType: "INDIVIDUAL",
    fullName: name,
    countryOfResidence: country,
    phoneNumber: phone
      ? normalizeYcMomoPhone(String(phone), country ?? "")
      : undefined,
    email: input.recipient.email || input.profile?.email || undefined,
    birthDate: input.profile?.dateOfBirth || undefined,
  }
}

/** Build Grid external account payload from Easner recipient row. */
export function buildGridExternalAccountPayload(input: {
  customerId: string
  recipient: RecipientSellPrepareRow
  profile?: GridPersonProfile
  rail: "bank_transfer" | "mobile_money"
  gridBankCandidates?: string[]
  gridMomoCandidates?: GridMomoProviderOption[]
}): { currency: string; customerId: string; accountInfo: Record<string, unknown> } {
  const recipient = applyProviderBindingToRecipient(input.recipient, "grid")
  const currency = String(recipient.currency || "").trim().toUpperCase()
  const country = resolveRecipientPayoutCountry(recipient)?.toUpperCase()
  if (!currency) throw new Error("Recipient currency is required for Grid external account.")

  const beneficiary = beneficiaryFromRecipient({ recipient, profile: input.profile })
  const accountType = currencyAccountType(currency)
  const bankName = resolveGridBankName(
    String(recipient.bank_name ?? "").trim(),
    input.gridBankCandidates,
  )
  const accountNumber = normalizeGridBankAccountNumber(
    currency,
    String(recipient.account_number ?? ""),
  )
  const mobileProvider = resolveGridMomoProvider(
    String(recipient.mobile_provider ?? "").trim(),
    input.gridMomoCandidates,
  )
  const metadata = normalizeRecipientYcMetadata(recipient.metadata)
  const useMomo = gridUsesMomoAccountShape({
    rail: input.rail,
    currency,
    mobileProvider,
    bankName,
  })

  const accountInfo: Record<string, unknown> = {
    accountType,
    beneficiary,
  }

  if (useMomo) {
    const phone = String(recipient.phone_number ?? input.profile?.phone ?? accountNumber ?? "").trim()
    if (!phone) throw new Error("Mobile money recipient requires phone number.")
    accountInfo.phoneNumber = normalizeYcMomoPhone(phone, country ?? "")
    if (mobileProvider) accountInfo.provider = mobileProvider
    if (currency === "XOF" && country && ["BJ", "CI", "SN", "TG"].includes(country)) {
      accountInfo.region = country
    }
    if (currency === "XAF" && country && ["CM", "CG"].includes(country)) {
      accountInfo.region = country
    }
  } else if (GRID_IBAN_CURRENCIES.has(currency)) {
    const iban = String(recipient.iban ?? accountNumber).replace(/\s/g, "").toUpperCase()
    if (!iban) throw new Error("IBAN is required for this bank recipient.")
    accountInfo.iban = iban
    const swift = String(recipient.swift_bic ?? "").trim()
    if (swift) accountInfo.swiftCode = swift.toUpperCase()
  } else {
    if (!accountNumber) throw new Error("Bank recipient requires account number.")
    if (currency === "MXN") {
      accountInfo.clabeNumber = accountNumber
    } else {
      accountInfo.accountNumber = accountNumber
    }
    if (bankName) accountInfo.bankName = bankName
    if (currency === "CAD") {
      const cad = mapCadRoutingToGridMetadata({
        routingNumber: recipient.routing_number,
        sortCode: recipient.sort_code,
        metadata,
      })
      if (cad.bank_code) accountInfo.bankCode = cad.bank_code
      if (cad.branch_code) accountInfo.branchCode = cad.branch_code
    } else {
      if (metadata.branch_code) accountInfo.branchCode = metadata.branch_code
      if (recipient.sort_code) accountInfo.sortCode = recipient.sort_code
      if (metadata.bank_code) accountInfo.bankCode = metadata.bank_code
    }
    if (metadata.ifsc) accountInfo.ifsc = metadata.ifsc
    const swift = String(recipient.swift_bic ?? "").trim()
    if (swift) accountInfo.swiftCode = swift.toUpperCase()
    if (currency === "XOF" && country && ["BJ", "CI", "SN", "TG"].includes(country)) {
      accountInfo.region = country
    }
    if (currency === "XAF" && country && ["CM", "CG"].includes(country)) {
      accountInfo.region = country
    }
  }

  return {
    currency,
    customerId: input.customerId,
    accountInfo,
  }
}

export async function createGridExternalAccount(input: {
  customerId: string
  recipient: RecipientSellPrepareRow
  profile?: GridPersonProfile
  rail: "bank_transfer" | "mobile_money"
  idempotencyKey?: string
  gridBankCandidates?: string[]
  gridMomoCandidates?: GridMomoProviderOption[]
}): Promise<GridExternalAccount> {
  const payload = buildGridExternalAccountPayload(input)
  const idempotencyKey =
    input.idempotencyKey?.trim() ||
    buildGridIdempotencyKey(`grid_ext_${input.customerId}`, payload)
  return gridFetch<GridExternalAccount>({
    method: "POST",
    path: "/customers/external-accounts",
    json: payload,
    idempotencyKey,
  })
}

function extractSolanaAddressFromWalletInfo(info: Record<string, unknown> | undefined): string | null {
  if (!info) return null
  const candidates = [
    info.solanaAddress,
    info.depositAddress,
    info.address,
    info.walletAddress,
    info.publicKey,
    info.accountNumber,
  ]
  for (const c of candidates) {
    const v = String(c ?? "").trim()
    if (v.length >= 32 && v.length <= 64 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(v)) return v
  }
  return null
}

export function extractGridFundingSolanaAddress(quote: {
  paymentInstructions?: { accountOrWalletInfo?: Record<string, unknown> }
  fundingPaymentInstructions?: { accountOrWalletInfo?: Record<string, unknown> }
}): string | null {
  return (
    extractSolanaAddressFromWalletInfo(quote.paymentInstructions?.accountOrWalletInfo) ??
    extractSolanaAddressFromWalletInfo(quote.fundingPaymentInstructions?.accountOrWalletInfo)
  )
}

export function gridMinorUnits(amount: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round(amount * factor)
}

export function gridMajorUnits(minor: number, decimals = 2): number {
  const factor = 10 ** decimals
  return minor / factor
}
