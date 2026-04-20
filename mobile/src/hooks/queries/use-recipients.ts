import { useQuery } from '@tanstack/react-query'
import { qk } from '@easner/shared'
import { recipientService } from '../../lib/recipientService'
import { useScope } from '../../query/scope'
import type { Recipient } from '../../types'

export function useRecipientsList() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? qk.beneficiaries.list(scope) : ['recipients', 'disabled'],
    enabled: Boolean(scope),
    queryFn: async () => {
      if (!scope) return [] as Recipient[]
      return recipientService.getByUserId(scope.userId)
    },
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: true, freshness: 'operational' },
  })
}
