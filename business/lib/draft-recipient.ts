import type { Beneficiary } from "@/lib/recipient-types"
import {
  buildDraftRecipientId,
  recipientIdentityFromUpsertInput,
  recipientIdentityKey,
  isDraftRecipientId,
} from "@easner/shared"
import { buildDraftEasetagBeneficiary } from "@/lib/draft-easetag-beneficiary"
import {
  coerceBeneficiaryEasenetDisplay,
  createRecipient,
  toBeneficiary,
  type RecipientRow,
  type RecipientUpsertInput,
} from "@/lib/recipients-store"
import { getBrowserQueryClient } from "@/lib/query/query-client"
import { rememberSavedRecipient } from "@/hooks/use-recipients-cached"
import { probeStoredSupabaseSession } from "@/lib/query/web-persist"
import { getCountryCodeForCurrency } from "@easner/shared"

const countryByCurrency: Record<string, string> = {
  USD: "United States",
  GBP: "United Kingdom",
  EUR: "European Union",
}

function resolveCountryName(currency: string, countryCode?: string): string {
  const explicitCountryCode = String(countryCode || "").toUpperCase()
  if (explicitCountryCode) {
    try {
      const explicitLabel = new Intl.DisplayNames(["en"], { type: "region" }).of(explicitCountryCode)
      if (explicitLabel) return explicitLabel
    } catch {
      // fall through
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
  if (input.recipientType === "easenet" && input.payeeEasetag) {
    return `Easetag (@${input.payeeEasetag})`
  }
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

/** Build an in-memory beneficiary for send flow (not persisted until resolve). */
export function buildDraftBeneficiary(input: RecipientUpsertInput): Beneficiary {
  if (input.recipientType === "easenet" && input.payeeEasetag) {
    return buildDraftEasetagBeneficiary({
      easetag: input.payeeEasetag,
      fullName: input.fullName,
      avatarUrl: null,
    })
  }

  const identity = recipientIdentityFromUpsertInput(input)
  const id = identity
    ? buildDraftRecipientId(recipientIdentityKey(identity))
    : `draft_recipient:${Date.now()}`
  const now = new Date().toISOString()
  const bankName = deriveBankName(input)
  const countryCode = String(input.countryCode || "").toUpperCase() || undefined

  return {
    id,
    countryCode,
    name: input.fullName.trim(),
    bankName,
    accountNumber: input.accountNumber,
    fullAccountNumber: input.accountNumber,
    routingNumber: input.routingNumber,
    iban: input.iban,
    bic: input.swiftBic,
    sortCode: input.sortCode,
    country: resolveCountryName(input.currency, countryCode),
    currency: input.currency,
    email: input.email || "",
    phone: input.phoneNumber || "",
    transferType: input.transferType,
    checkingOrSavings: input.checkingOrSavings,
    addressLine1: input.addressLine1,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
    mobileProvider: input.mobileProvider,
    walletAsset: input.walletAsset,
    walletNetwork: input.walletNetwork,
    ycMetadata: input.ycMetadata,
    createdAt: now,
    lastUsed: now,
  }
}

export async function resolveDraftRecipient(
  beneficiary: Beneficiary,
  draftUpsert?: RecipientUpsertInput,
): Promise<Beneficiary> {
  if (!isDraftRecipientId(beneficiary.id)) {
    return coerceBeneficiaryEasenetDisplay(beneficiary)
  }
  const payload = draftUpsert ?? recipientUpsertFromBeneficiary(beneficiary)
  if (!payload) {
    throw new Error("Draft recipient is missing save payload.")
  }
  const saved = await createRecipient(payload)
  const ownerUserId = probeStoredSupabaseSession().userId
  if (ownerUserId) {
    rememberSavedRecipient(getBrowserQueryClient(), ownerUserId, saved)
  }
  return coerceBeneficiaryEasenetDisplay(saved)
}

export function beneficiaryFromRecipientRow(row: RecipientRow): Beneficiary {
  return coerceBeneficiaryEasenetDisplay(toBeneficiary(row))
}

export function recipientUpsertFromBeneficiary(beneficiary: Beneficiary): RecipientUpsertInput | null {
  const tag = String(beneficiary.payeeEasetag || "").trim().replace(/^@+/, "").toLowerCase()
  if (tag) {
    return {
      recipientType: "easenet",
      countryCode: "US",
      fullName: beneficiary.name.trim() || tag,
      accountNumber: tag,
      bankName: "",
      currency: "USD",
      payeeEasetag: tag,
    }
  }
  return null
}

export { isDraftRecipientId }
