"use client"

import type { Beneficiary } from "@/lib/recipient-types"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { getCountryCodeForCurrency } from "@easner/shared"

type RecipientRow = {
  id: string
  user_id: string
  country_code?: string | null
  full_name: string
  account_number: string
  bank_name: string
  phone_number?: string | null
  currency: string
  routing_number?: string | null
  sort_code?: string | null
  iban?: string | null
  swift_bic?: string | null
  transfer_type?: "ACH" | "Wire" | null
  checking_or_savings?: "checking" | "savings" | null
  address_line1?: string | null
  mobile_provider?: string | null
  wallet_network?: string | null
  wallet_memo_tag?: string | null
  created_at: string
  updated_at: string
}

export type RecipientUpsertInput = {
  recipientType: "bank" | "mobile" | "wallet"
  countryCode?: string
  fullName: string
  accountNumber: string
  bankName: string
  currency: string
  phoneNumber?: string
  mobileProvider?: string
  walletAsset?: string
  walletNetwork?: string
  walletMemoTag?: string
  routingNumber?: string
  sortCode?: string
  iban?: string
  swiftBic?: string
  transferType?: "ACH" | "Wire"
  checkingOrSavings?: "checking" | "savings"
  addressLine1?: string
}

const countryByCurrency: Record<string, string> = {
  USD: "United States",
  GBP: "United Kingdom",
  EUR: "European Union",
  XOF: "West Africa",
  XAF: "Central Africa",
}

function resolveCountryName(currency: string, countryCode?: string): string {
  const explicitCountryCode = String(countryCode || "").toUpperCase()
  if (explicitCountryCode) {
    try {
      const explicitLabel = new Intl.DisplayNames(["en"], { type: "region" }).of(explicitCountryCode)
      if (explicitLabel) return explicitLabel
    } catch {
      // Fall through to currency-based fallback.
    }
  }
  const currencyCode = String(currency || "").toUpperCase()
  if (countryByCurrency[currencyCode]) return countryByCurrency[currencyCode]
  const iso = getCountryCodeForCurrency(currencyCode)
  if (!iso) return currencyCode
  try {
    const label = new Intl.DisplayNames(["en"], { type: "region" }).of(iso)
    return label || currencyCode
  } catch {
    return currencyCode
  }
}

function deriveBankName(input: RecipientUpsertInput): string {
  if (input.recipientType === "mobile" && input.mobileProvider) {
    return `Mobile Money (${input.mobileProvider})`
  }
  if (input.recipientType === "wallet" && input.walletAsset && input.walletNetwork) {
    return `Wallet (${input.walletAsset}/${input.walletNetwork})`
  }
  if (input.recipientType === "wallet" && input.walletNetwork) {
    return `Wallet (${input.walletNetwork})`
  }
  return input.bankName
}

function toWritePayload(input: RecipientUpsertInput) {
  return {
    country_code: input.countryCode || null,
    full_name: input.fullName,
    account_number: input.accountNumber,
    bank_name: deriveBankName(input),
    phone_number: input.phoneNumber || null,
    currency: input.currency,
    routing_number: input.routingNumber || null,
    sort_code: input.sortCode || null,
    iban: input.iban || null,
    swift_bic: input.swiftBic || input.walletMemoTag || null,
    transfer_type: input.transferType || null,
    checking_or_savings: input.checkingOrSavings || null,
    address_line1: input.addressLine1 || null,
    mobile_provider: input.mobileProvider || null,
    wallet_network: input.walletNetwork || null,
    wallet_memo_tag: input.walletMemoTag || null,
  }
}

async function parseApiError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string; details?: string; hint?: string; code?: string }
    return JSON.stringify({
      status: res.status,
      error: body.error || body.message || "Request failed",
      details: body.details,
      hint: body.hint,
      code: body.code,
    })
  } catch {
    return JSON.stringify({ status: res.status, error: res.statusText || "Request failed" })
  }
}

export function toBeneficiary(row: RecipientRow): Beneficiary {
  const mobileInnerMatch = row.bank_name.match(/^Mobile Money \((.*)\)$/i)
  const mobileInner = mobileInnerMatch?.[1] || ""
  const mobileProvider = mobileInner.includes("|CC:") ? mobileInner.split("|CC:")[0] : mobileInner
  const legacyCountryCodeFromMobile = mobileInner.includes("|CC:")
    ? mobileInner.split("|CC:")[1]?.trim().toUpperCase()
    : undefined
  const walletMatch = row.bank_name.match(/^Wallet \((.*)\)$/i)
  const walletDescriptor = walletMatch?.[1] || ""
  const [walletAssetFromLabel, walletNetworkFromLabel] = walletDescriptor.includes("/")
    ? walletDescriptor.split("/")
    : [undefined, walletDescriptor || undefined]
  const normalizedCountryCode = (row.country_code || legacyCountryCodeFromMobile || "").trim().toUpperCase() || undefined
  return {
    id: row.id,
    countryCode: normalizedCountryCode,
    name: row.full_name,
    bankName: mobileInnerMatch ? `Mobile Money (${mobileProvider})` : row.bank_name,
    accountNumber: row.account_number,
    fullAccountNumber: row.account_number,
    routingNumber: row.routing_number || undefined,
    iban: row.iban || undefined,
    bic: row.swift_bic || undefined,
    sortCode: row.sort_code || undefined,
    country: resolveCountryName(row.currency, normalizedCountryCode),
    currency: row.currency,
    email: "",
    phone: row.phone_number || "",
    createdAt: row.created_at,
    lastUsed: row.updated_at || row.created_at,
    transferType: row.transfer_type || undefined,
    checkingOrSavings: row.checking_or_savings || undefined,
    addressLine1: row.address_line1 || undefined,
    mobileProvider: row.mobile_provider || mobileProvider || undefined,
    walletAsset: walletAssetFromLabel || undefined,
    walletNetwork: row.wallet_network || walletNetworkFromLabel || undefined,
    walletMemoTag: row.wallet_memo_tag || (walletMatch ? row.swift_bic || undefined : undefined),
  }
}

export async function listRecipients(userId?: string): Promise<Beneficiary[]> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : ""
  const res = await fetchWithSession(`/api/recipients${qs}`)
  if (!res.ok) {
    throw new Error(await parseApiError(res))
  }
  const body = (await res.json()) as { recipients?: RecipientRow[] }
  return (body.recipients || []).map(toBeneficiary)
}

export async function createRecipient(input: RecipientUpsertInput): Promise<Beneficiary> {
  const res = await fetchWithSession("/api/recipients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toWritePayload(input)),
  })
  if (!res.ok) {
    throw new Error(await parseApiError(res))
  }
  const body = (await res.json()) as { recipient: RecipientRow }
  return toBeneficiary(body.recipient)
}

export async function updateRecipient(recipientId: string, input: RecipientUpsertInput): Promise<Beneficiary> {
  const res = await fetchWithSession(`/api/recipients/${encodeURIComponent(recipientId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toWritePayload(input)),
  })
  if (!res.ok) {
    throw new Error(await parseApiError(res))
  }
  const body = (await res.json()) as { recipient: RecipientRow }
  return toBeneficiary(body.recipient)
}

export async function deleteRecipient(recipientId: string): Promise<void> {
  const res = await fetchWithSession(`/api/recipients/${encodeURIComponent(recipientId)}`, {
    method: "DELETE",
  })
  if (!res.ok) {
    throw new Error(await parseApiError(res))
  }
}
