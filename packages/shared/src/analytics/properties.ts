export type SendMethod = "bank" | "momo" | "wallet" | "easetag" | "card" | "unknown"

/** Bucket amounts for funnel analysis without storing exact values. */
export function amountBucket(amount: number, currency?: string): string {
  if (!Number.isFinite(amount) || amount <= 0) return "zero"
  if (amount < 10) return "under_10"
  if (amount < 100) return "10_to_100"
  if (amount < 1_000) return "100_to_1000"
  if (amount < 10_000) return "1000_to_10000"
  if (amount < 100_000) return "10000_to_100000"
  return "over_100000"
}

export function corridor(sendCurrency: string, receiveCurrency: string): string {
  const send = sendCurrency.trim().toUpperCase()
  const receive = receiveCurrency.trim().toUpperCase()
  if (!send || !receive) return "unknown"
  return `${send}_${receive}`
}

export function sendFunnelProperties(input: {
  sendCurrency?: string
  receiveCurrency?: string
  sendAmount?: number
  receiveAmount?: number
  method?: SendMethod | string
  transactionId?: string
  error?: string
}): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  if (input.sendCurrency) props.send_currency = input.sendCurrency
  if (input.receiveCurrency) props.receive_currency = input.receiveCurrency
  if (input.sendCurrency && input.receiveCurrency) {
    props.corridor = corridor(input.sendCurrency, input.receiveCurrency)
  }
  if (input.sendAmount != null && Number.isFinite(input.sendAmount)) {
    props.send_amount_bucket = amountBucket(input.sendAmount, input.sendCurrency)
  }
  if (input.receiveAmount != null && Number.isFinite(input.receiveAmount)) {
    props.receive_amount_bucket = amountBucket(input.receiveAmount, input.receiveCurrency)
  }
  if (input.method) props.method = input.method
  if (input.transactionId) props.transaction_id = input.transactionId
  if (input.error) props.error = input.error
  return props
}

export function invoiceProperties(input: {
  invoiceId?: string
  currency?: string
  amount?: number
  status?: string
}): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  if (input.invoiceId) props.invoice_id = input.invoiceId
  if (input.currency) props.currency = input.currency
  if (input.amount != null && Number.isFinite(input.amount)) {
    props.amount_bucket = amountBucket(input.amount, input.currency)
  }
  if (input.status) props.status = input.status
  return props
}

export function kybProperties(input: {
  step?: string | number
  status?: string
  provider?: string
}): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  if (input.step != null) props.step = input.step
  if (input.status) props.kyb_status = input.status
  if (input.provider) props.provider = input.provider
  return props
}
