"use client"

import { useCallback, useState } from "react"

export type YcPayInAttestResult = {
  attestedAt: string
  alreadyAttested?: boolean
}

export type UseYcPayInAttestInput = {
  attest: (input: { transactionId: string; transferId: string }) => Promise<YcPayInAttestResult>
  onSuccess: (transactionId: string) => void
}

export function useYcPayInAttest(input: UseYcPayInAttestInput) {
  const [attestLoading, setAttestLoading] = useState(false)
  const [attestError, setAttestError] = useState<string | null>(null)

  const attestPayment = useCallback(
    async (transactionId: string, transferId: string) => {
      if (attestLoading || !transactionId.trim() || !transferId.trim()) return
      setAttestError(null)
      setAttestLoading(true)
      try {
        await input.attest({
          transactionId: transactionId.trim(),
          transferId: transferId.trim(),
        })
        input.onSuccess(transactionId.trim())
      } catch (e) {
        setAttestError(e instanceof Error ? e.message : "Could not confirm payment")
      } finally {
        setAttestLoading(false)
      }
    },
    [attestLoading, input],
  )

  return {
    attestLoading,
    attestError,
    attestPayment,
    clearAttestError: () => setAttestError(null),
  }
}
