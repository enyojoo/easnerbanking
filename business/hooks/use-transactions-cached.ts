"use client"

import { useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import { CACHE_KEYS } from "@/lib/cache"
import { useCachedData } from "@/lib/use-cached-data"
import { fetchWithSession } from "@/lib/fetch-with-session"
import type { TransactionWithSource } from "@/lib/transactions"
import { toast } from "sonner"

export const TRANSACTIONS_LIST_CACHE_TTL_MS = 5 * 60 * 1000

const LEDGER_BUSINESS_HEADERS = { "X-Easner-Noah-Scope": "business" } as const

async function fetchTransactionsList(): Promise<TransactionWithSource[]> {
  const res = await fetchWithSession("/api/transactions", { headers: { ...LEDGER_BUSINESS_HEADERS } })
  const body = (await res.json().catch(() => ({}))) as {
    transactions?: TransactionWithSource[]
    error?: string
  }
  if (!res.ok) {
    throw new Error(body.error || "Could not load transactions.")
  }
  return body.transactions ?? []
}

export function useTransactionsCached() {
  const { user, isLoading } = useAuth()

  const fetcher = useCallback(() => fetchTransactionsList(), [])

  return useCachedData<TransactionWithSource[]>({
    enabled: Boolean(user?.id) && !isLoading,
    cacheKey: user?.id ? CACHE_KEYS.TRANSACTIONS_LIST(user.id) : null,
    persistKey: user?.id ? `transactions_list_cache_${user.id}` : undefined,
    initialData: [],
    ttlMs: TRANSACTIONS_LIST_CACHE_TTL_MS,
    fetcher,
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      console.error("Transactions list load failed:", message)
      toast.error(message || "Could not load transactions.")
    },
  })
}
