/**
 * Cached fetch of business app `GET /api/business/allowed-countries` for mobile flows.
 * Uses same session-length memory cache as web (no refetch per combobox open).
 */

import type { JurisdictionSurface } from '@easner/shared'
import { getApiBaseUrl } from './apiClient'

export type AllowedCountriesPayload = {
  surface: JurisdictionSurface
  policyVersion: number
  unrestricted: boolean
  codes: string[] | null
}

const memory: Partial<Record<JurisdictionSurface, AllowedCountriesPayload>> = {}

export async function getAllowedCountriesCached(surface: JurisdictionSurface): Promise<AllowedCountriesPayload> {
  const hit = memory[surface]
  if (hit) return hit

  const base = getApiBaseUrl()
  if (!base) {
    const fallback: AllowedCountriesPayload = {
      surface,
      policyVersion: 0,
      unrestricted: true,
      codes: null,
    }
    memory[surface] = fallback
    return fallback
  }

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
  return body
}

/** Call after login / when office policy may have changed. */
export function clearJurisdictionCountryPolicyCache() {
  delete memory.signup
  delete memory.kyb
}
