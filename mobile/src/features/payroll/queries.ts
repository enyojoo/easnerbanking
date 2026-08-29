import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../query/api-client'
import { useScope } from '../../query/scope'
import type { PayrollConnectionDetail, PayrollConnectionsResponse } from './types'

export const PAYROLL_CONNECTIONS_STALE_MS = 5 * 60_000
export const PAYROLL_CONNECTION_DETAIL_STALE_MS = 60_000

const PAYROLL_CONNECTIONS_META = { safePersist: false, freshness: 'operational' as const }

export function payrollConnectionsKey(userId: string) {
  return ['personal', userId, 'payroll', 'connections'] as const
}

export function payrollConnectionDetailKey(userId: string, connectionId: string) {
  return ['personal', userId, 'payroll', 'connections', connectionId] as const
}

export function fetchPayrollConnections() {
  return apiFetch<PayrollConnectionsResponse>('/api/payroll/connections')
}

export function fetchPayrollConnectionDetail(connectionId: string) {
  return apiFetch<{ connection: PayrollConnectionDetail }>(
    `/api/payroll/connections/${connectionId}`,
  ).then((response) => response.connection)
}

export function prefetchPayrollConnections(
  qc: QueryClient,
  userId: string | null | undefined,
): Promise<void> {
  if (!userId) return Promise.resolve()
  return qc.prefetchQuery({
    queryKey: payrollConnectionsKey(userId),
    queryFn: fetchPayrollConnections,
    staleTime: PAYROLL_CONNECTIONS_STALE_MS,
    gcTime: 60 * 60_000,
    meta: PAYROLL_CONNECTIONS_META,
  })
}

export function prefetchPayrollConnectionDetail(
  qc: QueryClient,
  userId: string | null | undefined,
  connectionId: string,
): Promise<void> {
  if (!userId || !connectionId) return Promise.resolve()
  return qc.prefetchQuery({
    queryKey: payrollConnectionDetailKey(userId, connectionId),
    queryFn: () => fetchPayrollConnectionDetail(connectionId),
    staleTime: PAYROLL_CONNECTION_DETAIL_STALE_MS,
    gcTime: 30 * 60_000,
    meta: PAYROLL_CONNECTIONS_META,
  })
}

export function usePayrollConnections() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? payrollConnectionsKey(scope.userId) : ['personal', 'payroll', 'connections', 'disabled'],
    enabled: Boolean(scope),
    queryFn: fetchPayrollConnections,
    staleTime: PAYROLL_CONNECTIONS_STALE_MS,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: true,
    // Receiving destinations contain full employee-owned details. Keep this
    // authenticated cache in memory only; the lightweight summary endpoint
    // remains the source for persisted More-screen visibility.
    meta: PAYROLL_CONNECTIONS_META,
  })
}

export function usePayrollConnectionDetail(connectionId: string | null) {
  const { scope } = useScope()
  const queryClient = useQueryClient()

  return useQuery({
    queryKey:
      scope && connectionId
        ? payrollConnectionDetailKey(scope.userId, connectionId)
        : ['personal', 'payroll', 'connection', 'disabled'],
    enabled: Boolean(scope && connectionId),
    queryFn: () => fetchPayrollConnectionDetail(connectionId!),
    placeholderData: (previousData) => {
      if (!scope || !connectionId) return previousData
      const list = queryClient.getQueryData<PayrollConnectionsResponse>(payrollConnectionsKey(scope.userId))
      const summary = list?.connections.find((item) => item.id === connectionId)
      if (!summary) return previousData
      const methods =
        summary.methods && summary.methods.length > 0
          ? summary.methods
          : summary.preferredMethod
            ? [summary.preferredMethod]
            : []
      return {
        ...summary,
        readinessStatus: previousData?.readinessStatus ?? null,
        sharedIdentity: previousData?.sharedIdentity ?? {},
        methods,
        paymentHistory: previousData?.paymentHistory ?? [],
      } satisfies PayrollConnectionDetail
    },
    staleTime: PAYROLL_CONNECTION_DETAIL_STALE_MS,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
    meta: PAYROLL_CONNECTIONS_META,
  })
}
