import * as Device from 'expo-device'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type {
  Notification,
  NotificationResponse,
  Subscription,
} from 'expo-notifications'
import { isExpoGo } from './expoGo'

type NotificationsModule = typeof import('expo-notifications')

let notificationsLazy: NotificationsModule | null = null

function getNotifications(): NotificationsModule | null {
  if (isExpoGo) return null
  if (!notificationsLazy) {
    // Load only outside Expo Go — avoids SDK 53+ noisy warnings when remote push is unavailable there.
    notificationsLazy = require('expo-notifications') as NotificationsModule
    notificationsLazy.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
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

class PushNotificationService {
  private expoPushToken: string | null = null

  /**
   * Register for push notifications and get the Expo push token
   */
  async registerForPushNotifications(): Promise<string | null> {
    const Notifications = getNotifications()
    if (!Notifications) return null

    try {
      if (!Device.isDevice) {
        console.log('Must use physical device for Push Notifications')
        return null
      }

      const storedToken = await AsyncStorage.getItem('expoPushToken')
      if (storedToken) {
        this.expoPushToken = storedToken
        return storedToken
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync()
      let finalStatus = existingStatus

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync()
        finalStatus = status
      }

      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!')
        return null
      }

      const token = (await Notifications.getExpoPushTokenAsync()).data
      this.expoPushToken = token

      await AsyncStorage.setItem('expoPushToken', token)

      console.log('Expo push token:', token)
      return token
    } catch (error) {
      console.error('Error registering for push notifications:', error)
      return null
    }
  }

  getPushToken(): string | null {
    return this.expoPushToken
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

  removeNotificationSubscription(subscription: Subscription) {
    if (subscription && typeof subscription.remove === 'function') {
      subscription.remove()
    }
  }
}

export const pushNotificationService = new PushNotificationService()
