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

type NoahRateRow = {
  from_currency: string
  to_currency: string
  rate: number
  as_of?: string
}

function mapNoahRateRows(rows: NoahRateRow[], fallbackTs: string): ExchangeRate[] {
  return rows
    .filter((r) => Number.isFinite(r.rate) && r.rate > 0)
    .map((r) => {
      const from = r.from_currency.toUpperCase()
      const to = r.to_currency.toUpperCase()
      const at = r.as_of ?? fallbackTs
      return {
        id: `noah-${from}-${to}`.toLowerCase(),
        from_currency: from,
        to_currency: to,
        rate: r.rate,
        fee_type: 'free' as const,
        fee_amount: 0,
        status: 'active',
        created_at: at,
        updated_at: at,
      }
    })
}

/** Build exchange-rate rows from Noah GET /prices (batch catalog or per-pair fallback). */
export async function buildExchangeRatesFromNoahQuotes(
  getFxQuote: (p: {
    sourceCurrency: string
    destinationCurrency: string
    sourceAmount: string
  }) => Promise<{ destinationAmount?: string; impliedRate?: number }>,
  getBatchRates?: () => Promise<NoahRateRow[]>,
): Promise<ExchangeRate[]> {
  const t = ts()

  if (getBatchRates) {
    try {
      const batch = await getBatchRates()
      if (batch.length > 0) {
        return mapNoahRateRows(batch, t)
      }
    } catch {
      // fall through to per-pair quotes
    }
  }

  const out: ExchangeRate[] = []
  const pairs: Array<[string, string]> = [
    ['USD', 'EUR'],
    ['EUR', 'USD'],
  ]

  for (const [from, to] of pairs) {
    try {
      const q = await getFxQuote({
        sourceCurrency: from,
        destinationCurrency: to,
        sourceAmount: '100',
      })
      const rate =
        typeof q.impliedRate === 'number' && q.impliedRate > 0
          ? q.impliedRate
          : q.destinationAmount
            ? Number(q.destinationAmount) / 100
            : 0
      if (rate > 0) {
        out.push({
          id: `noah-${from}-${to}`.toLowerCase(),
          from_currency: from,
          to_currency: to,
          rate,
          fee_type: 'free',
          fee_amount: 0,
          status: 'active',
          created_at: t,
          updated_at: t,
        })
      }
    } catch {
      // omit unsupported pair
    }
  }

  return out
}
