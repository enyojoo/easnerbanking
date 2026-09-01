import { useQuery } from '@tanstack/react-query'
import type { ResolvedAccountRestriction } from '@easner/shared'
import { emptyAccountRestriction } from '@easner/shared'
import { fetchAccountRestriction } from '../../lib/accountRestriction'

export function useAccountRestriction(enabled = true) {
  return useQuery<ResolvedAccountRestriction>({
    queryKey: ['account-restriction'],
    queryFn: fetchAccountRestriction,
    staleTime: 30_000,
    enabled,
  })
}

export function useAccountRestrictionData(enabled = true): ResolvedAccountRestriction {
  const query = useAccountRestriction(enabled)
  return query.data ?? emptyAccountRestriction()
}
