import { filterBlockedJurisdictions, isEasnerBlockedJurisdiction } from "./jurisdiction-blocked-countries"

export type JurisdictionSurface = "signup" | "kyb"

export type JurisdictionCountryPolicyV1 = {
  v: number
  allowedSignup?: string[] | null
  allowedKybEntity?: string[] | null
}

export type CountryCatalogEntry = { name: string; code: string }

function normalizeIso2List(raw: string[] | null | undefined): string[] | null {
  if (raw == null) return null
  if (!Array.isArray(raw)) return null
  const out = new Set<string>()
  for (const x of raw) {
    const u = String(x || "").trim().toUpperCase()
    if (/^[A-Z]{2}$/.test(u)) out.add(u)
  }
  const arr = [...out]
  return arr.length === 0 ? null : arr
}

export function parseJurisdictionCountryPolicyJson(
  raw: string | null | undefined,
): { policy: JurisdictionCountryPolicyV1 | null; error: string | null } {
  if (raw == null || String(raw).trim() === "") {
    return { policy: null, error: null }
  }
  try {
    const parsed = JSON.parse(String(raw)) as unknown
    if (!parsed || typeof parsed !== "object") {
      return { policy: null, error: null }
    }
    const o = parsed as Record<string, unknown>
    const v = typeof o.v === "number" && Number.isFinite(o.v) ? o.v : 1
    const allowedSignup = normalizeIso2List(
      Array.isArray(o.allowedSignup) ? (o.allowedSignup as string[]) : null,
    )
    const allowedKybEntityRaw = o.allowedKybEntity
    let allowedKybEntity: string[] | null = null
    if (allowedKybEntityRaw === null || allowedKybEntityRaw === undefined) {
      allowedKybEntity = null
    } else if (Array.isArray(allowedKybEntityRaw)) {
      allowedKybEntity = normalizeIso2List(allowedKybEntityRaw)
    }
    return {
      policy: {
        v,
        allowedSignup: allowedSignup ?? undefined,
        allowedKybEntity: allowedKybEntity === null ? null : allowedKybEntity,
      },
      error: null,
    }
  } catch {
    return { policy: null, error: "invalid_json" }
  }
}

export function effectiveAllowlistForSurface(
  policy: JurisdictionCountryPolicyV1 | null,
  surface: JurisdictionSurface,
): string[] | null {
  if (!policy) return null
  if (surface === "signup") {
    return normalizeIso2List(policy.allowedSignup ?? null)
  }
  const kybExplicit = policy.allowedKybEntity
  if (kybExplicit == null) {
    return normalizeIso2List(policy.allowedSignup ?? null)
  }
  return normalizeIso2List(kybExplicit)
}

/**
 * Resolve picker allowlist: office policy ∩ catalog, minus blocked jurisdictions.
 * When policy is unrestricted (`rawAllowlist === null`), uses full catalog codes.
 */
export function resolveJurisdictionAllowlist(
  rawAllowlist: string[] | null,
  catalogCodes: string[],
): string[] {
  const catalogSet = new Set(catalogCodes.map((c) => c.toUpperCase()))
  const base =
    rawAllowlist == null
      ? [...catalogSet]
      : rawAllowlist.map((c) => c.toUpperCase()).filter((c) => catalogSet.has(c))
  return filterBlockedJurisdictions(base)
}

export { isEasnerBlockedJurisdiction, filterBlockedJurisdictions }

/** `allowedCodes === null` or `unrestricted === true` keeps full catalog. */
export function filterCountriesByPolicy<T extends CountryCatalogEntry>(
  catalog: T[],
  allowedCodes: string[] | null,
): T[] {
  if (allowedCodes == null) return catalog
  const set = new Set(allowedCodes.map((c) => c.toUpperCase()))
  return catalog.filter((row) => set.has(String(row.code).toUpperCase()))
}

export function serializeJurisdictionPolicy(policy: JurisdictionCountryPolicyV1): string {
  return JSON.stringify(policy)
}
