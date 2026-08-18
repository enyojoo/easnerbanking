"use client"

import { useCallback, useEffect, useState } from "react"
import { fetchWithSession } from "@/lib/fetch-with-session"
import type { PaymentLink } from "@/lib/payment-links/types"

export type PaymentLinkListRow = PaymentLink & { url: string }

export function usePaymentLinks(options?: { includeArchived?: boolean }) {
  const includeArchived = options?.includeArchived ?? false
  const [links, setLinks] = useState<PaymentLinkListRow[]>([])
  const [easetag, setEasetag] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchWithSession(
        `/api/payment-links${includeArchived ? "?archived=true" : ""}`,
      )
      const body = (await res.json().catch(() => ({}))) as {
        links?: PaymentLinkListRow[]
        easetag?: string | null
        error?: string
      }
      if (!res.ok) throw new Error(body.error || "Could not load payment links")
      setLinks(body.links ?? [])
      setEasetag(body.easetag ?? null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load payment links")
    } finally {
      setLoading(false)
    }
  }, [includeArchived])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { links, easetag, loading, error, refetch }
}
