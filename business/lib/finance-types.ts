import type { YcPayInPaymentDetails } from "@easner/shared"

export interface Account {
  id: string
  currency: "USD" | "EUR" | "GBP" | "NGN"
  accountName: string
  bankName: string
  accountNumber: string
  fullAccountNumber: string
  routingNumber?: string
  sortCode?: string
  iban?: string
  bic?: string
  bankAddress?: string
  balance: number
  availableBalance: number
  status: "active" | "pending" | "closed"
  stablecoinAddress?: string
  stablecoinChain?: string
  stablecoinToken?: "USDC" | "EURC"
  showBankDepositTab?: boolean
  /** Fiat VA source for payment instruction copy (Grid vs Noah). */
  depositProvider?: "grid" | "noah"
}

export interface Card {
  id: string
  type: "debit" | "credit"
  form: "virtual" | "physical"
  last4: string
  fullCardNumber: string
  cvv: string
  status: "active" | "inactive" | "blocked"
  expiryDate: string
  cardholderName: string
  balance: number
  billingAddress: {
    street: string
    city: string
    state: string
    postalCode: string
    country: string
  }
}

export interface Transaction {
  id: string
  type: "ach" | "wire" | "book" | "card" | "stablecoin"
  amount: number
  baseAmount?: number
  baseCurrency?: string
  /** Value that entered or left the Easner account before reporting-base conversion. */
  accountImpactAmount?: number
  accountImpactCurrency?: string
  description: string
  date: string
  status: "completed" | "pending" | "processing" | "failed" | "processing_payment" | "confirming_payment" | "awaiting_payment"
  /** User-facing list row label (may differ from raw `status` slug, e.g. YC pay-in). */
  statusLabel?: string
  direction: "credit" | "debit"
  cardId?: string
  /** When the ledger row includes masked card tail (e.g. future card product). */
  cardLast4?: string
  category?: string
  fee?: number
  reference?: string
  /** Bank deposit ACH narration (e.g. "Sent from Grey") – separate from transaction id. */
  narration?: string
  transferId?: string
  invoiceId?: string
  collectionChannel?: string
  autopayoutConfigId?: string
  displayCurrency?: string
  paymentRail?: string
  /** Stripe Connect collection: Bank account | Stablecoin */
  settlementRailLabel?: string
  counterpartyName?: string
  txHash?: string
  walletAddress?: string
  counterpartyAddress?: string
  asset?: string
  chain?: string
  settledAt?: string
  /** Ledger row creation time – detail "When" (distinct from list `date`). */
  ledgerCreatedAt?: string
  /** YC pay-in: user-facing when (attestation / webhook), not quote lock. */
  displayWhenAt?: string
  /** YC pay-in awaiting user attestation. */
  payInAwaitingAttestation?: boolean
  /** YC pay-in quote lock time. */
  quoteLockedAt?: string
  /** YC pay-in payment instructions for detail "here" link. */
  ycPayInPaymentDetails?: YcPayInPaymentDetails | null
  /** YC pay-in deposit window expiry (ISO). */
  quoteExpiresAt?: string | null
  /** Detail row label – e.g. Easetag P2P shows "Easetag". */
  paymentScheme?: string
  /** Stripe invoice settlement: structured payment method for brand chip + mask. */
  stripePaymentMethod?: {
    type: string
    brand?: string
    last4?: string
    wallet?: string | null
    bankName?: string
  }
  /** Stripe invoice settlement payer identity (from checkout / bill-to). */
  customerName?: string
  customerEmail?: string
  /** User note from send flow (Easetag / payout metadata). */
  sendNote?: string
  /** Bank ACH pay-in detail only. */
  lifecycle?: Array<{
    id: string
    title: string
    description: string
    state: string
    occurredAt: string | null
    showPaymentDetailsLink?: boolean
  }>
  depositAmount?: number
  postedAmount?: number
  postedCurrency?: string
  /** Global payout detail hero title – the recipient name. */
  displayHeroTitle?: string
  ledgerAmount?: number
  ledgerCurrency?: string
  payoutReview?: import("@easner/shared").GlobalPayoutReviewSnapshot
  /** Balance debit vs YC cross-border local pay-in. */
  payoutReviewFlow?: import("@easner/shared").ReviewFlowKind
  depositReview?: import("@easner/shared").YcFundBalanceDepositReviewSnapshot
  moveReview?: import("@easner/shared").BalanceMoveReviewSnapshot
  inboundReceive?: import("@easner/shared").InboundReceiveDetailSnapshot
  recipientSnapshot?: import("@easner/shared").GlobalPayoutRecipientSnapshot
  transactionTiming?: import("@easner/shared").TransactionTimingRow[]
}

export interface StablecoinAccount {
  currency: "USD" | "EUR"
  stablecoin: "USDC" | "EURC" | "USDT"
  chain: string
  address: string
  memo: string
}

export interface StablecoinDeposit {
  id: string
  amount: number
  currency: "USD" | "EUR"
  stablecoin: "USDC" | "EURC"
  chain: string
  date: string
  senderAddress?: string
  memo?: string
  reference?: string
}

export interface Beneficiary {
  id: string
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
  transferType?: "ACH" | "Wire"
  checkingOrSavings?: "checking" | "savings"
  addressLine1?: string
  mobileProvider?: string
  walletAsset?: string
  walletNetwork?: string
  createdAt: string
  lastUsed: string
}

export interface PendingItem {
  id: string
  type: "approval" | "failed" | "action_required"
  title: string
  description: string
  amount?: number
  currency?: string
  createdAt: string
  href?: string
}
