import type { GlobalPayoutRecipientSnapshot } from "./global-payout-types"

export type TransactionRecipientDisplay = {
  fullName: string
  payeeEasetag?: string
  countryCode?: string
  currency?: string
  bankName?: string
  accountNumber?: string
  phone?: string
  mobileProvider?: string
  walletNetwork?: string
  walletAsset?: string
}

function normalizeEasetag(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
}

export function isEasetagHandleValue(
  value: string | null | undefined,
  tag: string,
): boolean {
  const normalized = normalizeEasetag(value)
  if (!normalized || !tag) return false
  return normalized === tag
}

/** Prefer a real display name; ignore `@tag`-only ledger fields. */
export function resolveEasetagDisplayName(input: {
  recipientName?: string | null
  counterpartyName?: string | null
  payeeEasetag: string
}): string {
  for (const candidate of [input.recipientName, input.counterpartyName]) {
    const trimmed = String(candidate ?? "").trim()
    if (trimmed && !isEasetagHandleValue(trimmed, input.payeeEasetag)) {
      return trimmed
    }
  }
  return ""
}

function resolvePayeeEasetag(input: {
  payeeEasetag?: string | null
  counterpartyName?: string | null
}): string {
  const direct = normalizeEasetag(input.payeeEasetag)
  if (direct) return direct
  const counterparty = String(input.counterpartyName ?? "").trim()
  if (counterparty.startsWith("@")) return normalizeEasetag(counterparty)
  return ""
}

function isWalletBankName(bankName?: string | null): boolean {
  return String(bankName ?? "").toLowerCase().includes("wallet")
}

/** Map persisted ledger recipient fields to review-style display props. */
export function resolveTransactionRecipientDisplay(input: {
  recipientSnapshot?: GlobalPayoutRecipientSnapshot | null
  recipientName?: string | null
  counterpartyName?: string | null
  counterpartyAddress?: string | null
  destinationAddress?: string | null
  receiveNetwork?: string | null
  receiveCurrency?: string | null
  payeeEasetag?: string | null
}): TransactionRecipientDisplay | null {
  const payeeTag = resolvePayeeEasetag(input)
  if (payeeTag) {
    const fullName = resolveEasetagDisplayName({
      recipientName: input.recipientName,
      counterpartyName: input.counterpartyName,
      payeeEasetag: payeeTag,
    })
    return {
      fullName,
      payeeEasetag: payeeTag,
      bankName: `Easetag (@${payeeTag})`,
      accountNumber: payeeTag,
      currency: "USD",
    }
  }

  const snap = input.recipientSnapshot
  if (snap?.full_name) {
    const network = String(input.receiveNetwork ?? "").trim() || undefined
    const isWallet = isWalletBankName(snap.bank_name) || Boolean(network)
    return {
      fullName: snap.full_name,
      countryCode: snap.country_code,
      currency: snap.currency ?? input.receiveCurrency ?? undefined,
      bankName: snap.bank_name ?? (isWallet ? "Wallet" : undefined),
      accountNumber: snap.account_number,
      phone: snap.phone,
      mobileProvider: snap.mobile_provider,
      walletNetwork: isWallet ? network : undefined,
      walletAsset: isWallet ? (snap.currency ?? input.receiveCurrency ?? undefined) : undefined,
    }
  }

  const address = String(input.counterpartyAddress ?? input.destinationAddress ?? "").trim()
  const name =
    String(input.counterpartyName ?? input.recipientName ?? "").trim() ||
    (address ? "Wallet transfer" : "")
  if (!name && !address) return null

  if (address || String(input.receiveNetwork ?? "").trim()) {
    return {
      fullName: name || "Wallet transfer",
      bankName: "Wallet",
      accountNumber: address || undefined,
      walletNetwork: String(input.receiveNetwork ?? "").trim() || undefined,
      walletAsset: String(input.receiveCurrency ?? "").trim() || undefined,
      currency: String(input.receiveCurrency ?? "").trim() || undefined,
    }
  }

  return name ? { fullName: name } : null
}
