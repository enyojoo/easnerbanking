"use client"

import { useQuery } from "@tanstack/react-query"
import { fetchWithSession } from "@/lib/fetch-with-session"
import type { ConsoleLivemode } from "@/lib/console/livemode"

export type PlatformVolumeSide = {
  moneyIn: number
  moneyOut: number
  total: number
}

export type PlatformOverviewTransaction = {
  id: string
  type: string
  amount: number
  currency: string
  direction: string
  status: string
  description: string | null
  created: string
}

export type PlatformOverview = {
  accounts: { id: string; currency: string; available: number; pending: number; livemode: boolean }[]
  lastError: {
    method: string
    path: string
    status: number | null
    error_code: string | null
    created_at: string
  } | null
  recentTransactions: PlatformOverviewTransaction[]
  volume: { USD: PlatformVolumeSide; EUR: PlatformVolumeSide }
  transactionCount: number
  moneyIn: number
  moneyOut: number
}

const EMPTY_SIDE: PlatformVolumeSide = { moneyIn: 0, moneyOut: 0, total: 0 }

export function usePlatformOverview(livemode: ConsoleLivemode) {
  return useQuery({
    queryKey: ["platform-overview", livemode],
    queryFn: async (): Promise<PlatformOverview> => {
      const res = await fetchWithSession(`/api/platform/overview?livemode=${livemode}`)
      const body = (await res.json().catch(() => ({}))) as PlatformOverview & { error?: string }
      if (!res.ok) throw new Error(body.error || "Could not load console")
      return {
        accounts: body.accounts ?? [],
        lastError: body.lastError ?? null,
        recentTransactions: body.recentTransactions ?? [],
        volume: {
          USD: body.volume?.USD ?? EMPTY_SIDE,
          EUR: body.volume?.EUR ?? EMPTY_SIDE,
        },
        transactionCount: Number(body.transactionCount ?? 0),
        moneyIn: Number(body.moneyIn ?? 0),
        moneyOut: Number(body.moneyOut ?? 0),
      }
    },
    staleTime: 15_000,
  })
}
