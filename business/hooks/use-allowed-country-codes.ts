"use client"

import { useMemo, useState } from "react"
import type { JurisdictionSurface } from "@easner/shared"
import { useCachedData } from "@/lib/use-cached-data"

type AllowedCountriesResponse = {
  surface: JurisdictionSurface
  policyVersion: number
  unrestricted: boolean
  codes: string[] | null
}

const memory: Partial<Record<JurisdictionSurface, AllowedCountriesResponse>> = {}

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined"
}

function sessionKey(surface: JurisdictionSurface, version: number) {
  return `easner_allowed_countries_${surface}_v${version}`
}

function writeSession(body: AllowedCountriesResponse) {
  if (!canUseSessionStorage()) return
  try {
    sessionStorage.setItem(sessionKey(body.surface, body.policyVersion), JSON.stringify(body))
  } catch {
    /* ignore quota */
  }
}

async function fetchAllowed(surface: JurisdictionSurface): Promise<AllowedCountriesResponse> {
  const res = await fetch(`/api/business/allowed-countries?surface=${encodeURIComponent(surface)}`)
  const data = (await res.json().catch(() => ({}))) as Partial<AllowedCountriesResponse>
  if (!res.ok) {
    throw new Error(
      typeof data === "object" && data && "error" in data
        ? String((data as { error?: string }).error)
        : "Failed to load country policy",
    )
  }
  return {
    surface: (data.surface as JurisdictionSurface) || surface,
    policyVersion: typeof data.policyVersion === "number" ? data.policyVersion : 0,
    unrestricted: Boolean(data.unrestricted),
    codes: Array.isArray(data.codes) ? data.codes : data.codes === null ? null : null,
  }
}

const CACHE_TTL_MS = 60 * 60 * 1000
/** Keep disk copy longer than TTL so cold loads skip network until TTL-driven revalidate. */
const PERSIST_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export function useAllowedCountryCodes(surface: JurisdictionSurface) {
  const [error, setError] = useState<string | null>(null)
  const fallbackPolicy = useMemo(
    (): AllowedCountriesResponse => ({
      surface,
      policyVersion: 0,
      unrestricted: true,
      codes: null,
    }),
    [surface],
  )

  const cacheKey = `jurisdiction_allowed_countries_${surface}`
  const persistKey = `easner_allowed_countries_ls_${surface}`

  const {
    data: payload,
    loading,
    refetch,
  } = useCachedData<AllowedCountriesResponse>({
    enabled: true,
    cacheKey,
    persistKey,
    initialData: fallbackPolicy,
    ttlMs: CACHE_TTL_MS,
    persistMaxAgeMs: PERSIST_MAX_AGE_MS,
    onError: (e) => setError(e instanceof Error ? e.message : "Failed to load"),
    fetcher: async () => {
      setError(null)
      const body = await fetchAllowed(surface)
      memory[surface] = body
      writeSession(body)
      return body
    },
  })

  const allowedCodeSet = useMemo(() => {
    if (!payload || payload.unrestricted || payload.codes == null) return null
    return new Set(payload.codes.map((c) => c.toUpperCase()))
  }, [payload])

  return {
    policyVersion: payload.policyVersion,
    unrestricted: payload.unrestricted,
    codes: payload.codes,
    allowedCodeSet,
    loading,
    error,
    refresh: refetch,
  }
}
