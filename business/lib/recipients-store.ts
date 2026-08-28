"use client"

import type { Beneficiary } from "@/lib/recipient-types"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { readEasenetPublicProfileCache } from "@/lib/easenet-public-profile-cache"
import { countryCodeForRecipientSave, getCountryCodeForCurrency, mapCadRoutingToGridMetadata, normalizeRecipientBankName } from "@easner/shared"

export type RecipientRow = {
  id: string
  user_id: string
  country_code?: string | null
  full_name: string
  account_number: string
  bank_name: string
  phone_number?: string | null
  email?: string | null
  currency: string
  routing_number?: string | null
  sort_code?: string | null
  iban?: string | null
  swift_bic?: string | null
  transfer_type?: "ACH" | "Wire" | "RTP" | "FEDNOW" | null
  checking_or_savings?: "checking" | "savings" | null
  address_line1?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  mobile_provider?: string | null
  wallet_network?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type RecipientUpsertInput = {
  recipientType: "bank" | "mobile" | "wallet" | "easenet"
  countryCode?: string
  fullName: string
  accountNumber: string
  bankName: string
  currency: string
  phoneNumber?: string
  email?: string
  mobileProvider?: string
  walletAsset?: string
  walletNetwork?: string
  routingNumber?: string
  sortCode?: string
  iban?: string
  swiftBic?: string
  transferType?: "ACH" | "Wire" | "RTP" | "FEDNOW" | "SEPA" | "SEPA Instant"
  checkingOrSavings?: "checking" | "savings"
  addressLine1?: string
  city?: string
  state?: string
  postalCode?: string
  /** Normalized easetag (no @); required for easenet */
  payeeEasetag?: string
  /** Yellowcard LatAm extras (pix_key_type, cuit, …) */
  ycMetadata?: Record<string, unknown>
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
  const rail =
    input.recipientType === "easenet"
      ? "easetag"
      : input.recipientType === "mobile"
        ? "mobile"
        : input.recipientType === "wallet"
          ? "wallet"
          : "bank"
  return normalizeRecipientBankName({
    recipientType: rail,
    mobileProvider: input.mobileProvider,
    walletAsset: input.walletAsset,
    walletNetwork: input.walletNetwork,
    payeeEasetag: input.payeeEasetag,
    bankName: input.bankName,
  })
}

function toWritePayload(input: RecipientUpsertInput) {
  const metadata =
    String(input.countryCode || "").toUpperCase() === "CA" &&
    String(input.currency || "").toUpperCase() === "CAD"
      ? mapCadRoutingToGridMetadata({
          routingNumber: input.routingNumber,
          sortCode: input.sortCode,
          metadata: input.ycMetadata,
        })
      : (input.ycMetadata ?? {})
  return {
    country_code:
      countryCodeForRecipientSave({
        countryCode: input.countryCode,
        currencyCode: input.currency,
      }) || null,
    full_name: input.fullName,
    account_number: input.accountNumber,
    bank_name: deriveBankName(input),
    phone_number: input.phoneNumber || null,
    email: input.email?.trim() || null,
    currency: input.currency,
    routing_number: input.routingNumber || null,
    sort_code: input.sortCode || null,
    iban: input.iban || null,
    swift_bic: input.swiftBic || null,
    transfer_type: input.transferType || null,
    checking_or_savings: input.checkingOrSavings || null,
    address_line1: input.addressLine1 || null,
    city: input.city || null,
    state: input.state || null,
    postal_code: input.postalCode || null,
    mobile_provider: input.mobileProvider || null,
    wallet_network: input.walletNetwork || null,
    metadata,
  }
}

/** Normalized handle from our canonical `Easetag (@handle)` label or looser legacy copies. */
function parseEasetagFromBankLabel(bankName: string): string | undefined {
  const bn = String(bankName || "").trim()
  if (!bn) return undefined
  const strict = bn.match(/^Easetag\s*\(\s*@?([^)]+?)\s*\)\s*$/i)
  if (strict?.[1]) {
    const t = strict[1].trim().replace(/^@+/, "").toLowerCase()
    return t || undefined
  }
  const loose = bn.match(/Easetag\s*\(\s*@?([^)]+?)\s*\)/i)
  if (loose?.[1]) {
    const t = loose[1].trim().replace(/^@+/, "").toLowerCase()
    return t || undefined
  }
  return undefined
}

/** When the label is ambiguous, Easenet rows still store the tag in `account_number`. */
function easetagFromAccountIfEasenetRow(row: RecipientRow, bankNameTrimmed: string): string | undefined {
  const low = bankNameTrimmed.toLowerCase()
  if (!low.includes("easetag") && !low.includes("easenet")) return undefined
  const acct = String(row.account_number || "").trim().replace(/^@+/, "").toLowerCase()
  if (!acct) return undefined
  if (/^[a-z0-9][a-z0-9_-]*$/.test(acct)) return acct
  return undefined
}

/**
 * Ensures `payeeEasetag` is set when the row is clearly an Easetag recipient but DB columns were empty
 * (e.g. old mobile writes or cached client objects).
 */
export function coerceBeneficiaryEasenetDisplay(b: Beneficiary): Beneficiary {
  if (String(b.payeeEasetag || "").trim()) return b
  const fromLabel = parseEasetagFromBankLabel(b.bankName)
  if (fromLabel) return { ...b, payeeEasetag: fromLabel }
  const low = String(b.bankName || "").toLowerCase()
  if (!low.includes("easetag") && !low.includes("easenet")) return b
  const acct = String(b.fullAccountNumber || b.accountNumber || "").trim().replace(/^@+/, "").toLowerCase()
  if (acct && /^[a-z0-9][a-z0-9_-]*$/.test(acct)) return { ...b, payeeEasetag: acct }
  return b
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
  const bankNameTrimmed = String(row.bank_name ?? "").trim()
  const easetagFromBankName =
    parseEasetagFromBankLabel(bankNameTrimmed) ?? easetagFromAccountIfEasenetRow(row, bankNameTrimmed)
  const mobileInnerMatch = bankNameTrimmed.match(/^Mobile Money \((.*)\)$/i)
  const mobileInner = mobileInnerMatch?.[1] || ""
  const mobileProvider = mobileInner.includes("|CC:") ? mobileInner.split("|CC:")[0] : mobileInner
  const legacyCountryCodeFromMobile = mobileInner.includes("|CC:")
    ? mobileInner.split("|CC:")[1]?.trim().toUpperCase()
    : undefined
  const walletMatch = bankNameTrimmed.match(/^Wallet \((.*)\)$/i)
  const walletDescriptor = walletMatch?.[1] || ""
  const [walletAssetFromLabel, walletNetworkFromLabel] = walletDescriptor.includes("/")
    ? walletDescriptor.split("/")
    : [undefined, walletDescriptor || undefined]
  const normalizedCountryCode = (row.country_code || legacyCountryCodeFromMobile || "").trim().toUpperCase() || undefined
  const easetag = easetagFromBankName || undefined
  const cachedEasenet = easetag ? readEasenetPublicProfileCache(easetag) : null
  return {
    id: row.id,
    countryCode: normalizedCountryCode,
    payeeEasetag: easetag,
    avatarUrl: cachedEasenet?.avatarUrl ?? undefined,
    name: row.full_name,
    bankName: mobileInnerMatch ? `Mobile Money (${mobileProvider})` : bankNameTrimmed,
    accountNumber: row.account_number,
    fullAccountNumber: row.account_number,
    routingNumber: row.routing_number || undefined,
    iban: row.iban || undefined,
    bic: row.swift_bic || undefined,
    sortCode: row.sort_code || undefined,
    country: resolveCountryName(row.currency, normalizedCountryCode),
    currency: row.currency,
    email: row.email || "",
    phone: row.phone_number || "",
    createdAt: row.created_at,
    lastUsed: row.updated_at || row.created_at,
    transferType: row.transfer_type || undefined,
    checkingOrSavings: row.checking_or_savings || undefined,
    addressLine1: row.address_line1 || undefined,
    city: row.city || undefined,
    state: row.state || undefined,
    postalCode: row.postal_code || undefined,
    mobileProvider: row.mobile_provider || mobileProvider || undefined,
    walletAsset: walletAssetFromLabel || undefined,
    walletNetwork: row.wallet_network || walletNetworkFromLabel || undefined,
    ycMetadata: (row.metadata as Record<string, unknown> | undefined) ?? undefined,
  }
}

export async function listRecipients(userId?: string): Promise<Beneficiary[]> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : ""
  const res = await fetchWithSession(`/api/recipients${qs}`)
  if (!res.ok) {
    throw new Error(await parseApiError(res))
  }
  const body = (await res.json()) as { recipients?: RecipientRow[] }
  return (body.recipients || []).map(toBeneficiary).map(coerceBeneficiaryEasenetDisplay)
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
  return coerceBeneficiaryEasenetDisplay(toBeneficiary(body.recipient))
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
  return coerceBeneficiaryEasenetDisplay(toBeneficiary(body.recipient))
}

export async function deleteRecipient(recipientId: string): Promise<void> {
  const res = await fetchWithSession(`/api/recipients/${encodeURIComponent(recipientId)}`, {
    method: "DELETE",
  })
  if (!res.ok) {
    throw new Error(await parseApiError(res))
  }
}
