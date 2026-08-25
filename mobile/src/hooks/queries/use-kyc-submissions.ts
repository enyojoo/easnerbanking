import { useQuery } from '@tanstack/react-query'
import { Platform } from 'react-native'
import { kycService, type KYCSubmission } from '../../lib/kycService'
import { useScope } from '../../query/scope'

/**
 * KYC submissions for the signed-in user (M3.4a).
 *
 * Replaces MoreScreen's hand-rolled `useState` + AsyncStorage 5-minute cache
 * (`easner_kyc_submissions_<id>`) with a TanStack query. Persistence goes
 * through the shared query persister (`meta.safePersist`) — matching what the
 * old cache stored on disk — and the 5-minute staleness window is expressed
 * as `staleTime` instead of a manual timestamp check.
 *
 * Native-only, like the old code path: the web target never fetched these.
 */

export const KYC_SUBMISSIONS_STALE_MS = 5 * 60_000

/** Same `['personal', userId, …]` scope-prefix convention as the payroll keys. */
export function kycSubmissionsKey(userId: string) {
  return ['personal', userId, 'kyc', 'submissions'] as const
}

const KYC_SUBMISSIONS_META = { safePersist: true, freshness: 'operational' as const }

export function useKycSubmissions() {
  const { scope } = useScope()
  return useQuery<KYCSubmission[]>({
    queryKey: scope ? kycSubmissionsKey(scope.userId) : ['personal', 'kyc', 'submissions', 'disabled'],
    enabled: Boolean(scope) && Platform.OS !== 'web',
    queryFn: async () => (await kycService.getByUserId(scope!.userId)) ?? [],
    staleTime: KYC_SUBMISSIONS_STALE_MS,
    gcTime: 60 * 60_000,
    meta: KYC_SUBMISSIONS_META,
  })
}
