/**
 * Canonical recipient identity for silent dedup across web, mobile, and API.
 */

export type RecipientRail = "easetag" | "wallet" | "mobile" | "bank"

export type EasetagRecipientIdentity = {
  rail: "easetag"
  tag: string
}

export type WalletRecipientIdentity = {
  rail: "wallet"
  network: string
  address: string
}

export type MobileRecipientIdentity = {
  rail: "mobile"
  countryCode: string
  provider: string
  phoneE164: string
}

export type BankRecipientIdentity = {
  rail: "bank"
  countryCode: string
  currency: string
  accountKey: string
}

export type RecipientIdentity =
  | EasetagRecipientIdentity
  | WalletRecipientIdentity
  | MobileRecipientIdentity
  | BankRecipientIdentity

/** Prefix for send-flow recipients not yet persisted (includes legacy `draft_easenet:`). */
export const DRAFT_RECIPIENT_ID_PREFIX = "draft_"

export type RecipientUpsertShape = {
  recipientType?: "bank" | "mobile" | "wallet" | "easenet"
  countryCode?: string
  currency?: string
  fullName?: string
  accountNumber?: string
  bankName?: string
  phoneNumber?: string
  mobileProvider?: string
  walletAsset?: string
  walletNetwork?: string
  routingNumber?: string
  sortCode?: string
  iban?: string
  payeeEasetag?: string
}

export type RecipientRowShape = {
  id?: string
  country_code?: string | null
  currency?: string | null
  full_name?: string | null
  account_number?: string | null
  bank_name?: string | null
  phone_number?: string | null
  mobile_provider?: string | null
  wallet_network?: string | null
  routing_number?: string | null
  sort_code?: string | null
  iban?: string | null
}

function normalizeSpaces(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, "").toLowerCase()
}

function normalizeTag(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
}

function normalizeCountryCode(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toUpperCase()
}

function normalizeCurrency(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toUpperCase()
}

function normalizePhoneE164(value: string | null | undefined): string {
  const digits = String(value || "").replace(/\D/g, "")
  return digits
}

export function parseEasetagFromBankLabel(bankName: string | null | undefined): string | null {
  const bn = String(bankName || "").trim()
  if (!bn) return null
  const strict = bn.match(/^Easetag\s*\(\s*@?([^)]+?)\s*\)\s*$/i)
  if (strict?.[1]) {
    const tag = normalizeTag(strict[1])
    return tag || null
  }
  const loose = bn.match(/Easetag\s*\(\s*@?([^)]+?)\s*\)/i)
  if (loose?.[1]) {
    const tag = normalizeTag(loose[1])
    return tag || null
  }
  return null
}

export function parseMobileProviderFromBankLabel(bankName: string | null | undefined): string | null {
  const match = String(bankName || "").match(/^Mobile Money \((.*)\)$/i)
  if (!match?.[1]) return null
  const inner = match[1].trim()
  const ccIdx = inner.lastIndexOf("|CC:")
  const provider = ccIdx >= 0 ? inner.slice(0, ccIdx).trim() : inner
  return provider || null
}

export function parseWalletDescriptorFromBankLabel(
  bankName: string | null | undefined,
): { asset?: string; network?: string } | null {
  const match = String(bankName || "").match(/^Wallet \((.*)\)$/i)
  if (!match?.[1]) return null
  const descriptor = match[1].trim()
  if (!descriptor) return null
  if (descriptor.includes("/")) {
    const [asset, network] = descriptor.split("/")
    return {
      asset: asset?.trim() || undefined,
      network: network?.trim() || undefined,
    }
  }
  return { network: descriptor }
}

export function normalizeRecipientBankName(input: {
  recipientType: RecipientRail | "easenet"
  mobileProvider?: string | null
  walletAsset?: string | null
  walletNetwork?: string | null
  payeeEasetag?: string | null
  bankName?: string | null
}): string {
  const type = input.recipientType === "easenet" ? "easetag" : input.recipientType
  if (type === "easetag") {
    const tag = normalizeTag(input.payeeEasetag)
    return tag ? `Easetag (@${tag})` : String(input.bankName || "").trim()
  }
  if (type === "mobile") {
    const provider = String(input.mobileProvider || "").trim()
    return provider ? `Mobile Money (${provider})` : "Mobile Money"
  }
  if (type === "wallet") {
    const asset = String(input.walletAsset || "").trim()
    const network = String(input.walletNetwork || "").trim()
    if (asset && network) return `Wallet (${asset}/${network})`
    if (network) return `Wallet (${network})`
    return String(input.bankName || "").trim() || "Wallet"
  }
  return String(input.bankName || "").trim()
}

export function inferRecipientRailFromRow(row: RecipientRowShape): RecipientRail {
  const bankName = String(row.bank_name || "").trim()
  const bankLower = bankName.toLowerCase()
  if (bankLower.includes("easetag") || bankLower.includes("easenet")) return "easetag"
  if (row.wallet_network?.trim() || bankLower.startsWith("wallet (")) return "wallet"
  if (row.mobile_provider?.trim() || bankLower.startsWith("mobile money (")) return "mobile"
  return "bank"
}

export function recipientIdentityFromWritePayload(
  row: RecipientRowShape,
): RecipientIdentity | null {
  const rail = inferRecipientRailFromRow(row)
  const countryCode = normalizeCountryCode(row.country_code)

  if (rail === "easetag") {
    const tag =
      parseEasetagFromBankLabel(row.bank_name) ||
      normalizeTag(row.account_number)
    if (!tag) return null
    return { rail: "easetag", tag }
  }

  if (rail === "wallet") {
    const descriptor = parseWalletDescriptorFromBankLabel(row.bank_name)
    const network = normalizeSpaces(row.wallet_network || descriptor?.network || "")
    const address = normalizeSpaces(row.account_number)
    if (!network || !address) return null
    return { rail: "wallet", network, address }
  }

  if (rail === "mobile") {
    const provider =
      String(row.mobile_provider || "").trim() ||
      parseMobileProviderFromBankLabel(row.bank_name) ||
      ""
    const phoneE164 = normalizePhoneE164(row.phone_number || row.account_number)
    if (!provider || !phoneE164) return null
    return {
      rail: "mobile",
      countryCode: countryCode || "XX",
      provider,
      phoneE164,
    }
  }

  const currency = normalizeCurrency(row.currency)
  const iban = normalizeSpaces(row.iban)
  const account = normalizeSpaces(row.account_number)
  const routing = normalizeSpaces(row.routing_number || row.sort_code)
  const accountKey = iban || [account, routing].filter(Boolean).join(":")
  if (!accountKey || !currency) return null
  return {
    rail: "bank",
    countryCode: countryCode || "XX",
    currency,
    accountKey,
  }
}

export function recipientIdentityFromUpsertInput(
  input: RecipientUpsertShape,
): RecipientIdentity | null {
  const type = input.recipientType || "bank"
  const row: RecipientRowShape = {
    country_code: input.countryCode,
    currency: input.currency,
    account_number: input.accountNumber,
    bank_name: normalizeRecipientBankName({
      recipientType: type,
      mobileProvider: input.mobileProvider,
      walletAsset: input.walletAsset,
      walletNetwork: input.walletNetwork,
      payeeEasetag: input.payeeEasetag,
      bankName: input.bankName,
    }),
    phone_number: input.phoneNumber,
    mobile_provider: input.mobileProvider,
    wallet_network: input.walletNetwork,
    routing_number: input.routingNumber,
    sort_code: input.sortCode,
    iban: input.iban,
  }
  if (type === "easenet" && input.payeeEasetag) {
    return { rail: "easetag", tag: normalizeTag(input.payeeEasetag) }
  }
  return recipientIdentityFromWritePayload(row)
}

export function recipientIdentityKey(identity: RecipientIdentity): string {
  switch (identity.rail) {
    case "easetag":
      return `easetag:${identity.tag}`
    case "wallet":
      return `wallet:${identity.network}:${identity.address}`
    case "mobile":
      return `mobile:${identity.countryCode}:${identity.provider}:${identity.phoneE164}`
    case "bank":
      return `bank:${identity.countryCode}:${identity.currency}:${identity.accountKey}`
    default:
      return "unknown"
  }
}

export function isDraftRecipientId(id: string | null | undefined): boolean {
  return String(id || "").startsWith(DRAFT_RECIPIENT_ID_PREFIX)
}

/** Stable draft id from identity key (safe for session storage). */
export function buildDraftRecipientId(identityKey: string): string {
  const slug = identityKey.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 120)
  return `${DRAFT_RECIPIENT_ID_PREFIX}${slug}`
}

export function findMatchingRecipient<T extends RecipientRowShape>(
  rows: T[],
  identity: RecipientIdentity,
): T | null {
  const targetKey = recipientIdentityKey(identity)
  for (const row of rows) {
    const rowIdentity = recipientIdentityFromWritePayload(row)
    if (!rowIdentity) continue
    if (recipientIdentityKey(rowIdentity) === targetKey) return row
  }
  return null
}
