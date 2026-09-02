import { useQuery } from '@tanstack/react-query'
import type { ResolvedAccountRestriction } from '@easner/shared'
import { emptyAccountRestriction, qk } from '@easner/shared'
import { fetchAccountRestriction } from '../../lib/accountRestriction'

export function useAccountRestriction(enabled = true) {
  return useQuery<ResolvedAccountRestriction>({
    queryKey: qk.accountRestriction.root(),
    queryFn: fetchAccountRestriction,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    enabled,
  })
}

export function useAccountRestrictionData(enabled = true): ResolvedAccountRestriction {
  const query = useAccountRestriction(enabled)
  return query.data ?? emptyAccountRestriction()
}
