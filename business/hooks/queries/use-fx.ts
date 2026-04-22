"use client"

import { useQuery } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"

export type FxRate = { from_currency: string; to_currency: string; rate: number }

const FX_RATES_CACHE_KEY = "easner_business_fx_rates_v1"

function normalizeRates(input: unknown): FxRate[] {
  if (!Array.isArray(input)) return []
  return input
    .map((r) => {
      const row = r as Record<string, unknown>
      return {
        from_currency: String(row.from_currency ?? "").toUpperCase(),
        to_currency: String(row.to_currency ?? "").toUpperCase(),
        rate: Number(row.rate ?? 0),
      }
    })
    .filter((r) => r.from_currency && r.to_currency && Number.isFinite(r.rate) && r.rate > 0)
}

function readCachedFxRates(): FxRate[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(FX_RATES_CACHE_KEY)
    if (!raw) return []
    return normalizeRates(JSON.parse(raw))
  } catch {
    return []
  }
}

function writeCachedFxRates(rates: FxRate[]) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(FX_RATES_CACHE_KEY, JSON.stringify(rates))
  } catch {
    // ignore quota
  }
}

export function useFxRates() {
  return useQuery({
    queryKey: qk.fx.pairs(),
    queryFn: async () => {
      const body = await apiFetch<{ rates?: FxRate[] }>("/api/fx/exchange-rates", {
        headers: { "X-Easner-Noah-Scope": "business" },
      })
      return normalizeRates(body.rates ?? [])
    },
    initialData: readCachedFxRates(),
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    meta: { safePersist: true, webPersist: "reduced", freshness: "reference" },
  })
}

export function persistFxRates(rates: FxRate[]) {
  writeCachedFxRates(normalizeRates(rates))
}
