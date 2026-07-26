import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../query/api-client'
import { useScope } from '../../query/scope'
import type { PayrollConnectionDetail, PayrollConnectionsResponse } from './types'

export const PAYROLL_CONNECTIONS_STALE_MS = 5 * 60_000

export function payrollConnectionsKey(userId: string) {
  return ['personal', userId, 'payroll', 'connections'] as const
}

export function payrollConnectionDetailKey(userId: string, connectionId: string) {
  return ['personal', userId, 'payroll', 'connections', connectionId] as const
}

export function usePayrollConnections() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? payrollConnectionsKey(scope.userId) : ['personal', 'payroll', 'connections', 'disabled'],
    enabled: Boolean(scope),
    queryFn: () => apiFetch<PayrollConnectionsResponse>('/api/payroll/connections'),
    staleTime: PAYROLL_CONNECTIONS_STALE_MS,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: true,
    // Receiving destinations contain full employee-owned details. Keep this
    // authenticated cache in memory only; the lightweight summary endpoint
    // remains the source for persisted More-screen visibility.
    meta: { safePersist: false, freshness: 'operational' },
  })
}

export function usePayrollConnectionDetail(connectionId: string | null) {
  const { scope } = useScope()
  const queryClient = useQueryClient()
  const placeholderData = useMemo(() => {
    if (!scope || !connectionId) return undefined
    const list = queryClient.getQueryData<PayrollConnectionsResponse>(payrollConnectionsKey(scope.userId))
    const summary = list?.connections.find((item) => item.id === connectionId)
    if (!summary) return undefined
    return {
      ...summary,
      readinessStatus: null,
      sharedIdentity: {},
      methods: summary.preferredMethod ? [summary.preferredMethod] : [],
      paymentHistory: [],
    } satisfies PayrollConnectionDetail
  }, [connectionId, queryClient, scope])

  return useQuery({
    queryKey:
      scope && connectionId
        ? payrollConnectionDetailKey(scope.userId, connectionId)
        : ['personal', 'payroll', 'connection', 'disabled'],
    enabled: Boolean(scope && connectionId),
    queryFn: () =>
      apiFetch<{ connection: PayrollConnectionDetail }>(`/api/payroll/connections/${connectionId}`).then(
        (response) => response.connection,
      ),
    placeholderData,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
    meta: { safePersist: false, freshness: 'operational' },
  })
}
