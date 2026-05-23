import type { ExchangeRate, ManualPayInPaymentMethodOption } from "@easner/shared"
import { fetchWithSession } from "@/lib/fetch-with-session"

export type ManualSendCatalogResponse = {
  sendCurrencies: string[]
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
  direction: "send" | "receive"
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
  const res = await fetchWithSession("/api/manual-send/catalog")
  const data = (await res.json()) as ManualSendCatalogResponse & { error?: string }
  if (!res.ok) throw new Error(data.error || "Failed to load manual send catalog")
  return data
}

export async function fetchManualQuote(body: {
  direction: "send" | "receive"
  amount: number
  fromCurrency: string
  toCurrency: string
}): Promise<ManualQuoteResponse> {
  const res = await fetchWithSession("/api/fx/manual-quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as ManualQuoteResponse & { error?: string }
  if (!res.ok) throw new Error(data.error || "Quote failed")
  return data
}

export async function fetchManualPaymentMethod(id: string): Promise<PublicPaymentMethodDetail> {
  const res = await fetchWithSession(
    `/api/payment-methods?for=manual_send&id=${encodeURIComponent(id)}`,
  )
  const data = (await res.json()) as { payment_method?: PublicPaymentMethodDetail; error?: string }
  if (!res.ok) throw new Error(data.error || "Payment method not found")
  if (!data.payment_method) throw new Error("Payment method not found")
  return data.payment_method
}

export async function createManualSendOrder(body: {
  recipientId: string
  paymentMethodId: string
  quote: ManualQuoteResponse
  receiptUrl?: string | null
  referenceCode?: string
}): Promise<{ transactionId: string; referenceCode: string }> {
  const res = await fetchWithSession("/api/manual-send/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { transactionId?: string; referenceCode?: string; error?: string }
  if (!res.ok) throw new Error(data.error || "Failed to create order")
  return { transactionId: String(data.transactionId), referenceCode: String(data.referenceCode) }
}
