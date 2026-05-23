import { useQuery } from '@tanstack/react-query'
import { fetchManualSendCatalog } from '../../lib/manual-send-api'

export function useManualSendCatalog(enabled = true) {
  return useQuery({
    queryKey: ['manual-send', 'catalog'],
    queryFn: fetchManualSendCatalog,
    enabled,
    staleTime: 60_000,
  })
}
