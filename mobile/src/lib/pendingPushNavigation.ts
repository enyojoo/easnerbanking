import AsyncStorage from '@react-native-async-storage/async-storage'
import type { NavigationContainerRef } from '@react-navigation/native'
import { pushNotificationService } from './pushNotificationService'

const STORAGE_KEY = '@easner_pending_push_nav_v1'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export type PendingPushPayload =
  | { at: number; screen: 'TransactionDetails'; transactionId: string }
  | { at: number; screen: 'TransactionCard' }
  | { at: number; screen: 'InAppNotifications' }

export function setPushNavMainReady(ready: boolean): void {
  ;(global as any).easnerPushNavReady = ready
}

function isPushNavMainReady(): boolean {
  return Boolean((global as any).easnerPushNavReady)
}

function parsePushData(data: Record<string, unknown> | undefined): PendingPushPayload | null {
  if (!data || typeof data !== 'object') return null
  const now = Date.now()
  const transactionId = data.transactionId
  if (typeof transactionId === 'string' && transactionId.trim().length > 0) {
    return { at: now, screen: 'TransactionDetails', transactionId: transactionId.trim() }
  }
  if (data.type === 'card_transaction') {
    return { at: now, screen: 'TransactionCard' }
  }
  return { at: now, screen: 'InAppNotifications' }
}

export async function stashPendingPushFromNotificationData(
  data: Record<string, unknown> | undefined,
): Promise<void> {
  const pending = parsePushData(data)
  if (!pending) return
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pending))
  } catch (e) {
    console.warn('stashPendingPushFromNotificationData:', e)
  }
}

async function loadPending(): Promise<PendingPushPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingPushPayload
    if (!parsed?.screen || typeof parsed.at !== 'number') return null
    if (Date.now() - parsed.at > MAX_AGE_MS) {
      await AsyncStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

async function clearPending(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Navigate from a pending push tap once `MainStack` is active (PIN unlocked).
 * Safe to call anytime; no-ops when the user is still on PIN / auth / MFA.
 */
export function flushPendingPushNavigation(
  navigationRef: NavigationContainerRef<unknown> | null | undefined,
): void {
  if (!isPushNavMainReady()) return
  if (!navigationRef?.isReady()) return

  void (async () => {
    const pending = await loadPending()
    if (!pending) return

    try {
      switch (pending.screen) {
        case 'TransactionDetails':
          navigationRef.navigate('TransactionDetails' as never, {
            transactionId: pending.transactionId,
            fromScreen: 'PushNotification',
          } as never)
          break
        case 'TransactionCard':
          navigationRef.navigate('TransactionCard' as never, {} as never)
          break
        case 'InAppNotifications':
          navigationRef.navigate('InAppNotifications' as never, {} as never)
          break
        default:
          break
      }
      await clearPending()
    } catch (e) {
      console.warn('flushPendingPushNavigation:', e)
    }
  })()
}

import { Platform } from 'react-native'

/** Cold start / resume: Expo may not emit the response listener for the tap that launched the app. */
export async function bootstrapPushNotificationDeepLink(): Promise<void> {
  if (Platform.OS === 'web') return
  const response = await pushNotificationService.getLastNotificationResponse()
  if (!response?.notification) return
  const data = response.notification.request.content.data as Record<string, unknown> | undefined
  await stashPendingPushFromNotificationData(data)
  flushPendingPushNavigation(
    (global as any).rootNavigationRef?.current as NavigationContainerRef<unknown> | null,
  )
}
