import { useQuery } from '@tanstack/react-query'
import { AppState } from 'react-native'
import { useEffect } from 'react'
import { fetchMobilePlatformAccess } from '../lib/platformAccess'

const POLL_MS = 15_000

export function usePlatformAccess() {
  const query = useQuery({
    queryKey: ['platform-access', 'consumer_mobile'],
    queryFn: fetchMobilePlatformAccess,
    staleTime: 0,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  })

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void query.refetch()
    })
    return () => sub.remove()
  }, [query])

  return query
}
