import type { ExchangeRate, Transaction, TransactionData } from '../types'

function ts(): string {
  return new Date().toISOString()
}

function normalizeTxStatus(s: string): Transaction['status'] {
  const x = s.toLowerCase()
  if (x === 'pending' || x === 'processing' || x === 'completed' || x === 'failed' || x === 'cancelled') {
    return x
  }
  return 'completed'
}

/** Map `/api/noah/transactions` list item to legacy `Transaction` for dashboards that still expect it. */
export function mapNoahListItemToTransaction(
  userId: string,
  row: Record<string, unknown>,
): Transaction {
  const id = String(row.id ?? row.transaction_id ?? '')
  const amount =
    typeof row.amount === 'number'
      ? row.amount
      : typeof row.final_amount === 'number'
        ? row.final_amount
        : Number(row.amount ?? row.final_amount ?? 0)
  const currency = String(row.currency ?? row.send_currency ?? 'USD').toUpperCase()
  const created = String(row.created_at ?? row.noah_created_at ?? ts())
  const status = normalizeTxStatus(String(row.status ?? 'completed'))

  return {
    id,
    transaction_id: String(row.transaction_id ?? id),
    user_id: userId,
    ...(typeof row.recipient_id === 'string' && row.recipient_id
      ? { recipient_id: row.recipient_id }
      : {}),
    send_amount: amount,
    send_currency: currency,
    receive_amount: amount,
    receive_currency: currency,
    exchange_rate: 1,
    fee_amount: 0,
    fee_type: 'none',
    total_amount: amount,
    status,
    created_at: created,
    updated_at: created,
    completed_at: status === 'completed' ? created : undefined,
    metadata:
      row.metadata !== undefined && row.metadata !== null && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : undefined,
  }
}

/** Map Noah detail payload to `TransactionData` for transactionService consumers. */
export function mapNoahDetailToTransactionData(
  userId: string,
  row: Record<string, unknown>,
): TransactionData {
  const base = mapNoahListItemToTransaction(userId, row)
  return {
    ...base,
    failure_reason: typeof row.failure_reason === 'string' ? row.failure_reason : undefined,
    receipt_url: typeof row.receipt_url === 'string' ? row.receipt_url : undefined,
    receipt_filename: typeof row.receipt_filename === 'string' ? row.receipt_filename : undefined,
  }
}

/** Build minimal exchange-rate rows from Noah price quotes (no `exchange_rates` table). */
export async function buildExchangeRatesFromNoahQuotes(
  getFxQuote: (p: {
    sourceCurrency: string
    destinationCurrency: string
    sourceAmount: string
  }) => Promise<{ destinationAmount?: string; impliedRate?: number }>,
): Promise<ExchangeRate[]> {
  const t = ts()
  const out: ExchangeRate[] = []

  try {
    const usdToEur = await getFxQuote({
      sourceCurrency: 'USD',
      destinationCurrency: 'EUR',
      sourceAmount: '100',
    })
    const rateUe =
      typeof usdToEur.impliedRate === 'number' && usdToEur.impliedRate > 0
        ? usdToEur.impliedRate
        : usdToEur.destinationAmount
          ? Number(usdToEur.destinationAmount) / 100
          : 0
    if (rateUe > 0) {
      out.push({
        id: 'noah-usd-eur',
        from_currency: 'USD',
        to_currency: 'EUR',
        rate: rateUe,
        fee_type: 'free',
        fee_amount: 0,
        status: 'active',
        created_at: t,
        updated_at: t,
      })
    }
  } catch {
    // ignore — return partial or empty
  }

  try {
    const eurToUsd = await getFxQuote({
      sourceCurrency: 'EUR',
      destinationCurrency: 'USD',
      sourceAmount: '100',
    })
    const rateEu =
      typeof eurToUsd.impliedRate === 'number' && eurToUsd.impliedRate > 0
        ? eurToUsd.impliedRate
        : eurToUsd.destinationAmount
          ? Number(eurToUsd.destinationAmount) / 100
          : 0
    if (rateEu > 0) {
      out.push({
        id: 'noah-eur-usd',
        from_currency: 'EUR',
        to_currency: 'USD',
        rate: rateEu,
        fee_type: 'free',
        fee_amount: 0,
        status: 'active',
        created_at: t,
        updated_at: t,
      })
    }
  } catch {
    // ignore
  }

  return out
}
