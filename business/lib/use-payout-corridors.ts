"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PayoutCorridorPublic, PayoutRail } from "@easner/shared"
import { fetchWithSession } from "@/lib/fetch-with-session"

type CatalogResponse = {
  catalog_version?: string
  corridors?: PayoutCorridorPublic[]
}

const memory: Partial<Record<PayoutRail | "all", { etag: string; body: CatalogResponse }>> = {}

const canUseSessionStorage = () => typeof window !== "undefined" && typeof sessionStorage !== "undefined"

function readSessionRail(rail: PayoutRail | "all"): CatalogResponse | null {
  if (!canUseSessionStorage()) return null
  try {
    const raw = sessionStorage.getItem(`easner_payout_corridors_${rail}`)
    if (!raw) return null
    return JSON.parse(raw) as CatalogResponse
  } catch {
    return null
  }
}

function writeSessionRail(rail: PayoutRail | "all", body: CatalogResponse) {
  if (!canUseSessionStorage()) return
  try {
    sessionStorage.setItem(`easner_payout_corridors_${rail}`, JSON.stringify(body))
  } catch {
    // ignore quota / private mode
  }
}

function railParam(rail: PayoutRail | "all"): string {
  return rail === "all" ? "all" : rail
}

async function fetchCorridors(rail: PayoutRail | "all", etag?: string): Promise<{ status: number; body?: CatalogResponse; etag?: string }> {
  const headers: HeadersInit = {}
  if (etag) headers["If-None-Match"] = etag
  const res = await fetchWithSession(`/api/payout-corridors?rail=${encodeURIComponent(railParam(rail))}`, {
    headers,
  })
  const newEtag = res.headers.get("ETag") || undefined
  if (res.status === 304) {
    return { status: 304, etag: newEtag }
  }
  if (!res.ok) {
    throw new Error((await res.json().catch(() => ({}))).error || "Failed to load corridors")
  }
  const body = (await res.json()) as CatalogResponse
  return { status: res.status, body, etag: newEtag }
}

function initialCorridorRows(cacheKey: PayoutRail | "all"): PayoutCorridorPublic[] {
  return memory[cacheKey]?.body?.corridors ?? readSessionRail(cacheKey)?.corridors ?? []
}

export function usePayoutCorridors(rail: PayoutRail | "all") {
  const cacheKey = rail
  const [corridors, setCorridors] = useState<PayoutCorridorPublic[]>(() => initialCorridorRows(cacheKey))
  const [catalogVersion, setCatalogVersion] = useState<string | undefined>(
    () => memory[cacheKey]?.body?.catalog_version ?? readSessionRail(cacheKey)?.catalog_version,
  )
  const [loading, setLoading] = useState(() => initialCorridorRows(cacheKey).length === 0)
  const [error, setError] = useState<string | null>(null)
  const corridorsRef = useRef(corridors)
  corridorsRef.current = corridors

  const refresh = useCallback(async () => {
    const hasCatalogToShow =
      corridorsRef.current.length > 0 || initialCorridorRows(cacheKey).length > 0
    if (!hasCatalogToShow) {
      setLoading(true)
    }
    setError(null)
    try {
      const cached = memory[cacheKey]
      const r = await fetchCorridors(rail, cached?.etag)
      if (r.status === 304) {
        const body = cached?.body ?? readSessionRail(cacheKey)
        if (body) {
          setCorridors(body.corridors ?? [])
          setCatalogVersion(body.catalog_version)
        }
      } else if (r.body) {
        if (r.etag) memory[cacheKey] = { etag: r.etag, body: r.body }
        writeSessionRail(rail, r.body)
        setCorridors(r.body.corridors ?? [])
        setCatalogVersion(r.body.catalog_version)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load corridors")
    } finally {
      setLoading(false)
    }
  }, [rail, cacheKey])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const stableCorridors = useMemo(() => corridors, [corridors])

  return { corridors: stableCorridors, catalogVersion, loading, error, refresh }
}

/** Fire-and-forget prefetch for bank + mobile lists (e.g. after login). */
/** Deduped + freshness-windowed — see prefetchSendDestinations for why. */
const CORRIDORS_PREFETCH_FRESH_MS = 60_000
let corridorsPrefetchInflight: Promise<void> | null = null
let corridorsLastPrefetchedAt = 0

export function prefetchPayoutCorridors(): Promise<void> {
  if (corridorsPrefetchInflight) return corridorsPrefetchInflight
  if (
    memory.bank_transfer &&
    memory.mobile_money &&
    Date.now() - corridorsLastPrefetchedAt < CORRIDORS_PREFETCH_FRESH_MS
  ) {
    return Promise.resolve()
  }
  corridorsPrefetchInflight = prefetchPayoutCorridorsNow().finally(() => {
    corridorsPrefetchInflight = null
  })
  return corridorsPrefetchInflight
}

async function prefetchPayoutCorridorsNow(): Promise<void> {
  try {
    const [bank, mobile] = await Promise.all([
      fetchCorridors("bank_transfer", memory.bank_transfer?.etag),
      fetchCorridors("mobile_money", memory.mobile_money?.etag),
    ])
    corridorsLastPrefetchedAt = Date.now()
    if (bank.body && bank.etag) {
      memory.bank_transfer = { etag: bank.etag, body: bank.body }
      writeSessionRail("bank_transfer", bank.body)
    }
    if (mobile.body && mobile.etag) {
      memory.mobile_money = { etag: mobile.etag, body: mobile.body }
      writeSessionRail("mobile_money", mobile.body)
    }
  } catch {
    // ignore prefetch errors
  }
}
