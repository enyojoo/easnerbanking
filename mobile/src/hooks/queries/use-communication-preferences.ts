import { useQuery } from '@tanstack/react-query'
import type { CommunicationPreferences } from '@easner/shared'
import {
  DEFAULT_COMMUNICATION_PREFERENCES,
  parseCommunicationPreferences,
  qk,
} from '@easner/shared'
import { apiGet } from '../../lib/apiClient'
import { useScope } from '../../query/scope'

export function useCommunicationPreferences() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? qk.settings.communication(scope.userId) : ['communication', 'disabled'],
    enabled: Boolean(scope),
    /** Show toggles immediately; server response replaces placeholder when it arrives. */
    placeholderData: () => ({
      ...DEFAULT_COMMUNICATION_PREFERENCES,
      channels: { ...DEFAULT_COMMUNICATION_PREFERENCES.channels },
    }),
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
