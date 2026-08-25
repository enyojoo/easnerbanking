"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { SendDestinationsResponse } from "@easner/shared"
import { fetchWithSession } from "@/lib/fetch-with-session"

const memory: { etag?: string; body?: SendDestinationsResponse } = {}

function readSession(): SendDestinationsResponse | null {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return null
  try {
    const raw = sessionStorage.getItem("easner_send_destinations_v2")
    if (!raw) return null
    return JSON.parse(raw) as SendDestinationsResponse
  } catch {
    return null
  }
}

function writeSession(body: SendDestinationsResponse) {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return
  try {
    sessionStorage.setItem("easner_send_destinations_v2", JSON.stringify(body))
  } catch {
    // ignore
  }
}

async function fetchSendDestinations(etag?: string): Promise<{
  status: number
  body?: SendDestinationsResponse
  etag?: string
}> {
  const headers: HeadersInit = {}
  if (etag) headers["If-None-Match"] = etag
  const res = await fetchWithSession("/api/send-destinations?annotateProviders=true", { headers })
  const newEtag = res.headers.get("ETag") || undefined
  if (res.status === 304) return { status: 304, etag: newEtag }
  if (!res.ok) {
    throw new Error((await res.json().catch(() => ({}))).error || "Failed to load send destinations")
  }
  const body = (await res.json()) as SendDestinationsResponse
  return { status: res.status, body, etag: newEtag }
}

function initialBody(): SendDestinationsResponse | null {
  return memory.body ?? readSession()
}

export function useSendDestinations() {
  const [data, setData] = useState<SendDestinationsResponse | null>(() => initialBody())
  const [loading, setLoading] = useState(() => !initialBody())
  const [error, setError] = useState<string | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data

  const refresh = useCallback(async () => {
    if (!dataRef.current) setLoading(true)
    setError(null)
    try {
      const cached = memory.body ? memory : { body: readSession() ?? undefined, etag: memory.etag }
      const r = await fetchSendDestinations(cached.etag)
      if (r.status === 304 && cached.body) {
        setData(cached.body)
      } else if (r.body) {
        memory.body = r.body
        if (r.etag) memory.etag = r.etag
        writeSession(r.body)
        setData(r.body)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load send destinations")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const bankCorridors = useMemo(() => data?.fiat.bank_transfer ?? [], [data])
  const mobileCorridors = useMemo(() => data?.fiat.mobile_money ?? [], [data])
  const cryptoDestinations = useMemo(() => data?.crypto ?? [], [data])

  return {
    data,
    bankCorridors,
    mobileCorridors,
    cryptoDestinations,
    balanceCurrencies: data?.balance_currencies ?? [],
    catalogVersion: data?.catalog_version,
    loading,
    error,
    refresh,
  }
}

/**
 * Nav-hover and boot both call this; without dedup + a freshness window,
 * hovering "Send" repeatedly fired a round trip per hover (even a 304 is a
 * full network RTT) competing with the actual navigation.
 */
const PREFETCH_FRESH_MS = 60_000
let prefetchInflight: Promise<void> | null = null
let lastPrefetchedAt = 0

export function prefetchSendDestinations(): Promise<void> {
  if (prefetchInflight) return prefetchInflight
  if (memory.body && Date.now() - lastPrefetchedAt < PREFETCH_FRESH_MS) {
    return Promise.resolve()
  }
  prefetchInflight = (async () => {
    try {
      const r = await fetchSendDestinations(memory.etag)
      if (r.body && r.etag) {
        memory.body = r.body
        memory.etag = r.etag
        writeSession(r.body)
      }
      lastPrefetchedAt = Date.now()
    } catch {
      // ignore prefetch errors
    }
  })().finally(() => {
    prefetchInflight = null
  })
  return prefetchInflight
}
