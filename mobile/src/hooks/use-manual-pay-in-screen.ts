import { useEffect, useState } from 'react'
import {
  createManualSendOrder,
  fetchManualPaymentMethod,
  type PublicPaymentMethodDetail,
  type ManualQuoteResponse,
} from '../lib/manual-send-api'

export function useManualPayInScreen(paymentMethodId?: string) {
  const [pm, setPm] = useState<PublicPaymentMethodDetail | null>(null)
  const [loading, setLoading] = useState(Boolean(paymentMethodId))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!paymentMethodId) {
      setPm(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void fetchManualPaymentMethod(paymentMethodId)
      .then((row) => {
        if (!cancelled) {
          setPm(row)
          setError(null)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [paymentMethodId])

  return { pm, loading, error, isManual: Boolean(paymentMethodId) }
}

export async function completeManualSendOrder(input: {
  recipientId: string
  paymentMethodId: string
  manualQuote: ManualQuoteResponse | null
  referenceCode?: string
  receiptUrl?: string | null
}): Promise<{ transactionId: string; referenceCode: string }> {
  if (!input.manualQuote) {
    throw new Error('Quote is required to complete manual send')
  }
  return createManualSendOrder({
    recipientId: input.recipientId,
    paymentMethodId: input.paymentMethodId,
    quote: input.manualQuote,
    referenceCode: input.referenceCode,
    receiptUrl: input.receiptUrl,
  })
}
