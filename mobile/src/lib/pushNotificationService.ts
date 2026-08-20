import * as Device from 'expo-device'
import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import type {
  Notification,
  NotificationResponse,
  Subscription,
} from 'expo-notifications'
import { isExpoGo } from './expoGo'

type NotificationsModule = typeof import('expo-notifications')

let notificationsLazy: NotificationsModule | null = null

function getNotifications(): NotificationsModule | null {
  if (Platform.OS === 'web' || isExpoGo) return null
  if (!notificationsLazy) {
    // Load only outside Expo Go – avoids SDK 53+ noisy warnings when remote push is unavailable there.
    notificationsLazy = require('expo-notifications') as NotificationsModule
    notificationsLazy.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    })
  }
  return notificationsLazy
}

const noopSubscription = { remove: () => {} }

export interface PushNotificationData {
  title: string
  body: string
  data?: {
    transactionId?: string
    type?: 'transaction_update' | 'general'
    [key: string]: unknown
  }
}

/** Result of attempting to obtain an Expo push token (for server `user_push_devices`). */
export type RegisterPushResult =
  | { ok: true; token: string }
  | {
      ok: false
      reason: 'expo_go' | 'simulator' | 'permission_denied' | 'error'
      detail?: string
    }

function getExpoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra
  const eas =
    extra && typeof extra === 'object' && 'eas' in extra
      ? (extra as { eas?: { projectId?: string } }).eas
      : undefined
  const fromExtra = typeof eas?.projectId === 'string' ? eas.projectId.trim() : ''
  const fromEasConfig =
    typeof Constants.easConfig?.projectId === 'string' ? Constants.easConfig.projectId.trim() : ''
  const id = fromExtra || fromEasConfig
  return id.length > 0 ? id : undefined
}

class PushNotificationService {
  private expoPushToken: string | null = null

  /**
   * Register for push notifications and get the Expo push token for the backend.
   * Remote push requires a physical device; emulators and Expo Go cannot supply a real token.
   */
  async registerForPushNotifications(): Promise<RegisterPushResult> {
    const Notifications = getNotifications()
    if (!Notifications) {
      return { ok: false, reason: 'expo_go', detail: 'Use a dev build for remote push.' }
    }

    try {
      if (!Device.isDevice) {
        console.log('Must use physical device for Push Notifications')
        return {
          ok: false,
          reason: 'simulator',
          detail: 'Push tokens are not available on simulators/emulators.',
        }
      }

      const storedToken = await AsyncStorage.getItem('expoPushToken')
      if (storedToken) {
        this.expoPushToken = storedToken
        return { ok: true, token: storedToken }
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync()
      let finalStatus = existingStatus

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync()
        finalStatus = status
      }

      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!')
        return {
          ok: false,
          reason: 'permission_denied',
          detail: 'Allow notifications for this app in system Settings.',
        }
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#007ACC',
        })
      }

      const projectId = getExpoProjectId()
      const token = (
        projectId
          ? await Notifications.getExpoPushTokenAsync({ projectId })
          : await Notifications.getExpoPushTokenAsync()
      ).data
      this.expoPushToken = token

      await AsyncStorage.setItem('expoPushToken', token)

      console.log('Expo push token:', token)
      return { ok: true, token }
    } catch (error) {
      console.error('Error registering for push notifications:', error)
      const msg = error instanceof Error ? error.message : String(error)
      return { ok: false, reason: 'error', detail: msg }
    }
  }

  getPushToken(): string | null {
    return this.expoPushToken
  }

  async getCachedPushToken(): Promise<string | null> {
    if (this.expoPushToken) return this.expoPushToken
    try {
      const storedToken = await AsyncStorage.getItem('expoPushToken')
      this.expoPushToken = storedToken
      return storedToken
    } catch {
      return null
    }
  }

  /** Clear cached Expo token (e.g. user disabled push). Does not revoke OS permission. */
  async clearLocalPushToken(): Promise<void> {
    this.expoPushToken = null
    try {
      await AsyncStorage.removeItem('expoPushToken')
    } catch (e) {
      console.warn('clearLocalPushToken:', e)
    }
  }

  async sendLocalNotification(notification: PushNotificationData): Promise<void> {
    const Notifications = getNotifications()
    if (!Notifications) return

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: notification.data || {},
        },
        trigger: null,
      })
    } catch (error) {
      console.error('Error sending local notification:', error)
    }
  }

  async clearAllNotifications(): Promise<void> {
    const Notifications = getNotifications()
    if (!Notifications) return

    try {
      await Notifications.dismissAllNotificationsAsync()
    } catch (error) {
      console.error('Error clearing notifications:', error)
    }
  }

  async setBadgeCount(count: number): Promise<void> {
    const Notifications = getNotifications()
    if (!Notifications) return

    try {
      await Notifications.setBadgeCountAsync(count)
    } catch (error) {
      console.error('Error setting badge count:', error)
    }
  }

  addNotificationReceivedListener(listener: (notification: Notification) => void) {
    const Notifications = getNotifications()
    if (!Notifications) return noopSubscription as Subscription
    return Notifications.addNotificationReceivedListener(listener)
  }

  addNotificationResponseReceivedListener(listener: (response: NotificationResponse) => void) {
    const Notifications = getNotifications()
    if (!Notifications) return noopSubscription as Subscription
    return Notifications.addNotificationResponseReceivedListener(listener)
  }

  /** Tap that opened the app from quit – pair with `addNotificationResponseReceivedListener` for warm opens. */
  async getLastNotificationResponse(): Promise<NotificationResponse | null> {
    const Notifications = getNotifications()
    if (!Notifications) return null
    try {
      return await Notifications.getLastNotificationResponseAsync()
    } catch (e) {
      console.warn('getLastNotificationResponse:', e)
      return null
    }
  }

  removeNotificationSubscription(subscription: Subscription) {
    if (subscription && typeof subscription.remove === 'function') {
      subscription.remove()
    }
  }
}

export const pushNotificationService = new PushNotificationService()
