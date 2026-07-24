export type GridMoneyAmount = {
  amount: number
  currency?: { code?: string; decimals?: number }
}

export type GridQuote = {
  id: string
  createdAt?: string
  expiresAt?: string
  status?: string
  exchangeRate?: number
  totalReceivingAmount?: number
  totalSendingAmount?: number
  receivingCurrency?: { code?: string }
  sendingCurrency?: { code?: string }
  transactionId?: string
  paymentInstructions?: {
    accountOrWalletInfo?: Record<string, unknown>
    instructionsNotes?: string
    isPlatformAccount?: boolean
  }
  rateDetails?: {
    gridApiFixedFee?: number
    gridApiVariableFeeAmount?: number
    counterpartyFixedFee?: number
  }
}

export type GridCustomer = {
  id: string
  platformCustomerId?: string
  customerType?: string
  kycStatus?: string
  fullName?: string
}

export type GridExternalAccount = {
  id: string
  currency?: string
  status?: string
  customerId?: string
  accountInfo?: Record<string, unknown>
}

export type GridDiscovery = {
  country?: string
  currency?: string
  /** Canonical name for external account bankName/provider. */
  bankName?: string
  /** Human-friendly display label. */
  displayName?: string
  /** Legacy / optional rail hints from older API shapes. */
  paymentRails?: string[]
  accountTypes?: string[]
}

export type GridExchangeRate = {
  sourceCurrency?: string | { code?: string }
  destinationCurrency?: string | { code?: string }
  rate?: number
  exchangeRate?: number
  country?: string
}

export function gridCurrencyCode(value: GridExchangeRate["sourceCurrency"]): string {
  if (value == null) return ""
  if (typeof value === "string") return value.trim().toUpperCase()
  return String(value.code ?? "").trim().toUpperCase()
}

export function gridExchangeRateMid(row: GridExchangeRate): number {
  const mid = row.exchangeRate ?? row.rate
  return mid != null && Number.isFinite(Number(mid)) ? Number(mid) : 0
}

export type GridTransaction = {
  id: string
  status?: string
  type?: string
  direction?: string
  quoteId?: string
  customerId?: string
  platformCustomerId?: string
  failureReason?: string
  sentAmount?: GridMoneyAmount
  receivedAmount?: GridMoneyAmount
}

export type GridWebhookEvent = {
  eventType?: string
  type?: string
  data?: Record<string, unknown>
  id?: string
  createdAt?: string
}
