import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import { resolveRecipientPayoutCountry } from "@/lib/terminal/recipient-sell-prepare"
import { buildGridIdempotencyKey } from "./idempotency"
import { gridFetch } from "./http"
import type { GridExternalAccount } from "./types"
import type { GridPersonProfile } from "./kyc-metadata"
import {
  normalizeGridBankAccountNumber,
  normalizeYcMomoPhone,
  resolveGridBankName,
  resolveGridMomoProvider,
  type GridMomoProviderOption,
} from "@easner/shared"

function currencyAccountType(currency: string): string {
  return `${currency.trim().toUpperCase()}_ACCOUNT`
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
  const currency = String(input.recipient.currency || "").trim().toUpperCase()
  const country = resolveRecipientPayoutCountry(input.recipient)?.toUpperCase()
  if (!currency) throw new Error("Recipient currency is required for Grid external account.")

  const beneficiary = beneficiaryFromRecipient(input)
  const accountType = currencyAccountType(currency)
  const bankName = resolveGridBankName(
    String(input.recipient.bank_name ?? "").trim(),
    input.gridBankCandidates,
  )
  const accountNumber = normalizeGridBankAccountNumber(
    currency,
    String(input.recipient.account_number ?? ""),
  )
  const mobileProvider = resolveGridMomoProvider(
    String(input.recipient.mobile_provider ?? "").trim(),
    input.gridMomoCandidates,
  )

  const accountInfo: Record<string, unknown> = {
    accountType,
    beneficiary,
  }

  if (input.rail === "mobile_money") {
    const phone = String(input.recipient.phone_number ?? input.profile?.phone ?? "").trim()
    if (!phone) throw new Error("Mobile money recipient requires phone number.")
    accountInfo.phoneNumber = normalizeYcMomoPhone(phone, country ?? "")
    if (mobileProvider) accountInfo.provider = mobileProvider
  } else {
    if (!accountNumber) throw new Error("Bank recipient requires account number.")
    accountInfo.accountNumber = accountNumber
    if (bankName) accountInfo.bankName = bankName
    const meta = (input.recipient.metadata ?? {}) as Record<string, unknown>
    if (meta.branch_code) accountInfo.branchCode = String(meta.branch_code)
    if (input.recipient.sort_code) accountInfo.sortCode = input.recipient.sort_code
    if (meta.bank_code) accountInfo.bankCode = String(meta.bank_code)
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

export function extractGridFundingSolanaAddress(
  quote: { paymentInstructions?: { accountOrWalletInfo?: Record<string, unknown> } },
): string | null {
  const info = quote.paymentInstructions?.accountOrWalletInfo ?? {}
  const candidates = [
    info.solanaAddress,
    info.address,
    info.walletAddress,
    info.accountNumber,
  ]
  for (const c of candidates) {
    const v = String(c ?? "").trim()
    if (v.length >= 32) return v
  }
  return null
}

export function gridMinorUnits(amount: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round(amount * factor)
}

export function gridMajorUnits(minor: number, decimals = 2): number {
  const factor = 10 ** decimals
  return minor / factor
}
