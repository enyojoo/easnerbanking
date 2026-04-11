/**
 * Cached fetch of business app `GET /api/business/allowed-countries` for mobile flows.
 * In-memory + AsyncStorage (7d TTL) so send + recipients don’t refetch on every visit.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { JurisdictionSurface } from '@easner/shared'
import { getApiBaseUrl } from './apiClient'

export type AllowedCountriesPayload = {
  surface: JurisdictionSurface
  policyVersion: number
  unrestricted: boolean
  codes: string[] | null
}

const DISK_TTL_MS = 7 * 24 * 60 * 60 * 1000
const STORAGE_PREFIX = 'easner_jurisdiction_allowed_countries_v1_'

const memory: Partial<Record<JurisdictionSurface, AllowedCountriesPayload>> = {}
const inflight = new Map<JurisdictionSurface, Promise<AllowedCountriesPayload>>()

function storageKey(surface: JurisdictionSurface): string {
  return `${STORAGE_PREFIX}${surface}`
}

async function readPersisted(surface: JurisdictionSurface): Promise<AllowedCountriesPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(surface))
    if (!raw) return null
    const env = JSON.parse(raw) as { data: AllowedCountriesPayload; timestamp: number }
    if (Date.now() - env.timestamp > DISK_TTL_MS) {
      await AsyncStorage.removeItem(storageKey(surface))
      return null
    }
    return env.data
  } catch {
    return null
  }
}

async function writePersisted(surface: JurisdictionSurface, data: AllowedCountriesPayload): Promise<void> {
  try {
    await AsyncStorage.setItem(
      storageKey(surface),
      JSON.stringify({
        data,
        timestamp: Date.now(),
      }),
    )
  } catch {
    // ignore
  }
}

function unrestrictedFallback(surface: JurisdictionSurface): AllowedCountriesPayload {
  return {
    surface,
    policyVersion: 0,
    unrestricted: true,
    codes: null,
  }
}

export async function getAllowedCountriesCached(surface: JurisdictionSurface): Promise<AllowedCountriesPayload> {
  const hit = memory[surface]
  if (hit) return hit

  const disk = await readPersisted(surface)
  if (disk) {
    memory[surface] = disk
    return disk
  }

  const pending = inflight.get(surface)
  if (pending) return pending

  const promise = (async (): Promise<AllowedCountriesPayload> => {
    const base = getApiBaseUrl()
    if (!base) {
      const fb = unrestrictedFallback(surface)
      memory[surface] = fb
      return fb
    }

    try {
      const res = await fetch(`${base}/api/business/allowed-countries?surface=${encodeURIComponent(surface)}`)
      const data = (await res.json().catch(() => ({}))) as Partial<AllowedCountriesPayload>
      const body: AllowedCountriesPayload = {
        surface: (data.surface as JurisdictionSurface) || surface,
        policyVersion: typeof data.policyVersion === 'number' ? data.policyVersion : 0,
        unrestricted: data.unrestricted !== false,
        codes: Array.isArray(data.codes) ? data.codes : null,
      }
      if (!res.ok) {
        body.unrestricted = true
        body.codes = null
      }
      memory[surface] = body
      await writePersisted(surface, body)
      return body
    } catch {
      const fb = unrestrictedFallback(surface)
      memory[surface] = fb
      return fb
    } finally {
      inflight.delete(surface)
    }
  })()

  inflight.set(surface, promise)
  return promise
}

/** Call after logout / when office policy may have changed. */
export async function clearJurisdictionCountryPolicyCache(): Promise<void> {
  delete memory.signup
  delete memory.kyb
  inflight.clear()
  try {
    await AsyncStorage.multiRemove([storageKey('signup'), storageKey('kyb')])
  } catch {
    // ignore
  }
}
