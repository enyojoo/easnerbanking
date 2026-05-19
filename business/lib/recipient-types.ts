import type { PayeeAccountKind } from "@/lib/easner-brand"

export interface Beneficiary {
  id: string
  countryCode?: string
  /** Resolved Easetag (lowercase, no @) for payee P2P / wallet-to-wallet */
  payeeEasetag?: string
  /** From public Easetag profile: user vs business */
  payeeAccountKind?: PayeeAccountKind
  /** Snapshot URL from payee users.avatar_url */
  avatarUrl?: string
  name: string
  bankName: string
  accountNumber: string
  fullAccountNumber: string
  routingNumber?: string
  iban?: string
  bic?: string
  sortCode?: string
  country: string
  currency: string
  email: string
  phone: string
  /** US bank rail: Fedwire is stored as `Wire`. */
  transferType?: "ACH" | "Wire"
  checkingOrSavings?: "checking" | "savings"
  addressLine1?: string
  city?: string
  state?: string
  postalCode?: string
  noahExternalAccountId?: string
  mobileProvider?: string
  walletAsset?: string
  walletNetwork?: string
  walletMemoTag?: string
  createdAt: string
  lastUsed: string
}
