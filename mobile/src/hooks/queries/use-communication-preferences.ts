import { useQuery } from '@tanstack/react-query'
import type { CommunicationPreferences } from '@easner/shared'
import { parseCommunicationPreferences, qk } from '@easner/shared'
import { apiGet } from '../../lib/apiClient'
import { useScope } from '../../query/scope'

export function useCommunicationPreferences() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? qk.settings.communication(scope.userId) : ['communication', 'disabled'],
    enabled: Boolean(scope),
    queryFn: async () => {
      const res = await apiGet('/api/settings/communication')
      const body = (await res.json().catch(() => ({}))) as {
        preferences?: CommunicationPreferences
      }
      if (!res.ok || !body.preferences) return null
      return parseCommunicationPreferences(body.preferences)
    },
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: true, freshness: 'operational' },
  })
}
