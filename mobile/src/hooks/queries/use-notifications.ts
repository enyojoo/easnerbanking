import { useQuery } from '@tanstack/react-query'
import { qk } from '@easner/shared'
import { apiFetch } from '../../query/api-client'
import { useScope } from '../../query/scope'

/**
 * Personal notifications feed.
 *
 * The realtime bridge invalidates `qk.notifications.root(userId)` on
 * `notifications` INSERTs (see `attachRealtime`), so we keep a long stale window.
 */

export interface NotificationRow {
  id: string
  created_at: string
  read_at: string | null
  title: string
  body?: string
  type?: string
  metadata?: Record<string, unknown> | null
}

/**
 * Renamed to `useNotificationsQuery` to avoid colliding with the push-driven
 * `useNotifications` context that ships the in-memory feed on mobile. Screens
 * that want server-backed notifications should call this hook directly; the
 * realtime bridge invalidates `qk.notifications.root(userId)` on new rows.
 */
export function useNotificationsQuery() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? qk.notifications.root(scope.userId) : ['notifications', 'disabled'],
    enabled: Boolean(scope),
    queryFn: () =>
      apiFetch<{ notifications: NotificationRow[] }>('/api/notifications'),
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: true,
    meta: { safePersist: true, freshness: 'operational' },
  })
}

export function useUnreadNotificationsQuery() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? qk.notifications.unread(scope.userId) : ['notifications', 'unread', 'disabled'],
    enabled: Boolean(scope),
    queryFn: () =>
      apiFetch<{ count: number }>('/api/notifications/unread'),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: true,
    meta: { safePersist: false, freshness: 'operational' },
  })
}
