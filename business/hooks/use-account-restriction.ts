"use client"

import { useQuery } from "@tanstack/react-query"
import { fetchWithSession } from "@/lib/fetch-with-session"
import type { ResolvedAccountRestriction } from "@easner/shared"
import { emptyAccountRestriction, qk } from "@easner/shared"

async function fetchAccountRestriction(): Promise<ResolvedAccountRestriction> {
  const res = await fetchWithSession("/api/account/restriction")
  if (!res.ok) return emptyAccountRestriction()
  const json = (await res.json()) as { restriction?: ResolvedAccountRestriction }
  return json.restriction ?? emptyAccountRestriction()
}

export function useAccountRestriction(enabled = true) {
  return useQuery({
    queryKey: qk.accountRestriction.root(),
    queryFn: fetchAccountRestriction,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    enabled,
  })
}
