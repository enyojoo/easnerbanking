import { useEffect, useRef } from 'react'
import type { CommunicationPreferences } from '@easner/shared'
import { useAuth } from '../contexts/AuthContext'
import { apiGet, apiPost } from '../lib/apiClient'
import { pushNotificationService } from '../lib/pushNotificationService'

/**
 * After sign-in, sync Expo token with the business API when `channels.push` is on;
 * clear server + local token when push is off. Keeps backend aligned with preferences
 * without registering push on every cold start unconditionally.
 */
export function PushNotificationBootstrap() {
  const { user } = useAuth()
  const inFlight = useRef(false)

  useEffect(() => {
    if (!user?.id) return

    let cancelled = false

    const run = async () => {
      if (inFlight.current) return
      inFlight.current = true
      try {
        const res = await apiGet('/api/settings/communication')
        if (!res.ok || cancelled) return
        const j = (await res.json()) as { preferences?: CommunicationPreferences }
        const prefs = j.preferences
        if (!prefs || cancelled) return

        if (prefs.channels.push) {
          const token = await pushNotificationService.registerForPushNotifications()
          if (token && !cancelled) {
            await apiPost('/api/settings/push-token', { expoPushToken: token })
          }
        } else {
          await pushNotificationService.clearLocalPushToken()
          if (!cancelled) {
            await apiPost('/api/settings/push-token', { expoPushToken: null })
          }
        }
      } catch (e) {
        console.warn('PushNotificationBootstrap:', e)
      } finally {
        inFlight.current = false
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [user?.id])

  return null
}
