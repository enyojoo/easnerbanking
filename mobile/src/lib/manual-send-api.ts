import type {
  ExchangeRate,
  ManualPayInPaymentMethodOption,
  ManualSendCurrencyOption,
} from '@easner/shared'
import { apiFetch } from '../query/api-client'

export type ManualSendCatalogResponse = {
  sendCurrencies: string[]
  sendCurrencyOptions: ManualSendCurrencyOption[]
  exchangeRates: ExchangeRate[]
  paymentMethodsByCurrency: Record<string, ManualPayInPaymentMethodOption[]>
}

export type ManualQuoteResponse = {
  sendAmount: number
  receiveAmount: number
  exchangeRate: number
  feeAmount: number
  feeType: string
  totalAmount: number
  fromCurrency: string
  toCurrency: string
  direction: 'send' | 'receive'
  inputAmount: number
  minAmount?: number | null
  maxAmount?: number | null
}

export type PublicPaymentMethodDetail = {
  id: string
  currency: string
  name: string
  type: string
  is_default: boolean
  account_name?: string | null
  account_number?: string | null
  bank_name?: string | null
  routing_number?: string | null
  sort_code?: string | null
  iban?: string | null
  swift_bic?: string | null
  mobile_money_provider?: string | null
  phone_number?: string | null
  qr_code_data?: string | null
  stablecoin?: {
    wallet_address?: string
    network?: string
    memo?: string
  }
}

export async function fetchManualSendCatalog(): Promise<ManualSendCatalogResponse> {
  return apiFetch<ManualSendCatalogResponse>('/api/manual-send/catalog')
}

export async function fetchManualQuote(body: {
  direction: 'send' | 'receive'
  amount: number
  fromCurrency: string
  toCurrency: string
}): Promise<ManualQuoteResponse> {
  return apiFetch<ManualQuoteResponse, typeof body>('/api/fx/manual-quote', {
    method: 'POST',
    body,
  })
}

export async function fetchManualPaymentMethod(id: string): Promise<PublicPaymentMethodDetail> {
  const data = await apiFetch<{ payment_method: PublicPaymentMethodDetail }>(
    '/api/payment-methods',
    { query: { for: 'manual_send', id } },
  )
  return data.payment_method
}

export async function createManualSendOrder(body: {
  recipientId: string
  paymentMethodId: string
  quote: ManualQuoteResponse
  receiptUrl?: string | null
  referenceCode?: string
}): Promise<{ transactionId: string; referenceCode: string }> {
  return apiFetch('/api/manual-send/orders', { method: 'POST', body })
}
