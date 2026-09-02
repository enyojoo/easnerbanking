import type { ResolvedAccountRestriction } from "@easner/shared"
import { emptyAccountRestriction, resolvedAccountRestrictionFromRow } from "@easner/shared"
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
  subject_kind?: string | null
  phase?: string | null
  restricted_at?: string | null
  wind_down_ends_at?: string | null
  locked_at?: string | null
  lifted_at?: string | null
  reason?: string | null
  source?: string | null
} | null | undefined): ResolvedAccountRestriction {
  return resolvedAccountRestrictionFromRow(row)
}
