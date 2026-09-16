import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import type { CommunicationPreferences } from '@easner/shared'
import { useAuth } from '../contexts/AuthContext'
import { apiGet, apiPost } from '../lib/apiClient'
import { pushNotificationService } from '../lib/pushNotificationService'
import { waitUntilMainAppReady } from '../lib/pendingPushNavigation'

/**
 * After sign-in, sync Expo token with the business API when `channels.push` is on;
 * clear server + local token when push is off. Keeps backend aligned with preferences
 * without registering push on every cold start unconditionally.
 */
export function PushNotificationBootstrap() {
  const { user } = useAuth()
  const inFlight = useRef(false)

  useEffect(() => {
    if (Platform.OS === 'web') return
    if (!user?.id) return

    let cancelled = false

    const run = async () => {
      await waitUntilMainAppReady()
      if (cancelled || inFlight.current) return
      inFlight.current = true
      try {
        const res = await apiGet('/api/settings/communication')
        if (!res.ok || cancelled) return
        const j = (await res.json()) as { preferences?: CommunicationPreferences }
        const prefs = j.preferences
        if (!prefs || cancelled) return

        if (prefs.channels.push) {
          const reg = await pushNotificationService.registerForPushNotifications()
          if (reg.ok && !cancelled) {
            await apiPost('/api/settings/push-token', {
              expoPushToken: reg.token,
              platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : undefined,
            })
          }
        } else {
          const token = await pushNotificationService.getCachedPushToken()
          await pushNotificationService.clearLocalPushToken()
          if (!cancelled) {
            await apiPost('/api/settings/push-token', {
              expoPushToken: null,
              removeExpoPushToken: token,
            })
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
