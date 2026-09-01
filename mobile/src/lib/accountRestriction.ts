import type { ResolvedAccountRestriction } from "@easner/shared"
import { computeAccountRestrictionPhase, emptyAccountRestriction } from "@easner/shared"
import { getApiBaseUrl } from "./apiClient"
import { supabase } from "./supabase"

export async function fetchAccountRestriction(): Promise<ResolvedAccountRestriction> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) return emptyAccountRestriction()

    const res = await fetch(`${getApiBaseUrl()}/api/account/restriction`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
    })
    if (!res.ok) return emptyAccountRestriction()
    const json = (await res.json()) as { restriction?: ResolvedAccountRestriction }
    return json.restriction ?? emptyAccountRestriction()
  } catch {
    return emptyAccountRestriction()
  }
}

export function normalizeRestrictionRow(row: {
  phase?: string | null
  restricted_at?: string | null
  wind_down_ends_at?: string | null
  locked_at?: string | null
} | null | undefined): ResolvedAccountRestriction {
  if (!row?.restricted_at || !row.wind_down_ends_at) return emptyAccountRestriction()
  const phase = computeAccountRestrictionPhase({
    restrictedAt: row.restricted_at,
    windDownEndsAt: row.wind_down_ends_at,
    lockedAt: row.locked_at,
  })
  return {
    active: true,
    phase,
    subjectKind: null,
    restrictedAt: row.restricted_at,
    windDownEndsAt: row.wind_down_ends_at,
    lockedAt: row.locked_at,
    reason: null,
    source: null,
  }
}
