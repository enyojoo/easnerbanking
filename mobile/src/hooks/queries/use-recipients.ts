import { useQuery, type QueryClient } from '@tanstack/react-query'
import type { PersonalScope } from '@easner/shared'
import { qk } from '@easner/shared'
import { recipientService } from '../../lib/recipientService'
import { useScope } from '../../query/scope'
import type { Recipient } from '../../types'

/**
 * Recipients change infrequently; keep client cache warm like business beneficiaries.
 * `safePersist: true` → TanStack AsyncStorage rehydration shows lists without a network round-trip.
 * Foreground / mutation invalidation still forces fresh data when something actually changes.
 */
export const RECIPIENTS_STALE_MS = 60 * 60_000
const RECIPIENTS_GC_MS = 4 * 60 * 60_000

const RECIPIENTS_QUERY_META = { safePersist: true, freshness: 'operational' as const }

export function prefetchRecipientsList(
  qc: QueryClient,
  scope: PersonalScope | null | undefined,
): Promise<void> {
  if (!scope) return Promise.resolve()
  return qc.prefetchQuery({
    queryKey: qk.beneficiaries.list(scope),
    queryFn: async () => recipientService.getByUserId(scope.userId),
    staleTime: RECIPIENTS_STALE_MS,
    gcTime: RECIPIENTS_GC_MS,
    meta: RECIPIENTS_QUERY_META,
  })
}

export function useRecipientsList() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? qk.beneficiaries.list(scope) : ['recipients', 'disabled'],
    enabled: Boolean(scope),
    queryFn: async () => {
      if (!scope) return [] as Recipient[]
      return recipientService.getByUserId(scope.userId)
    },
    staleTime: RECIPIENTS_STALE_MS,
    gcTime: RECIPIENTS_GC_MS,
    meta: RECIPIENTS_QUERY_META,
  })
}
