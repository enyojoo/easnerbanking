import * as Linking from 'expo-linking'
import { Platform } from 'react-native'
import type { NavigationContainerRef } from '@react-navigation/native'
import { APP_URLS, isMobileDeepLinkHost } from '@easner/shared'
import {
  flushPendingDeepLinkNavigation,
  isSupabaseOauthAppCallback,
  parseDeepLinkFromUrl,
  stashPendingDeepLinkFromUrl,
} from '../lib/pendingDeepLinkNavigation'
import { analytics } from '../lib/analytics'

export interface DeepLinkData {
  screen: string
  params?: Record<string, string>
}

export class DeepLinkService {
  private static instance: DeepLinkService
  private linkingPrefix: string

  constructor() {
    this.linkingPrefix = Linking.createURL('/')
  }

  static getInstance(): DeepLinkService {
    if (!DeepLinkService.instance) {
      DeepLinkService.instance = new DeepLinkService()
    }
    return DeepLinkService.instance
  }

  /**
   * Initialize deep linking
   */
  async initialize(): Promise<void> {
    if (Platform.OS === 'web') return
    try {
      // Handle deep links when the app is already running.
      // Do NOT call `getInitialURL()` here – that URL is single-flight on some platforms, and
      // `AuthContext` must be the one to read it for OAuth (PKCE + fragment) during cold start.
      const subscription = Linking.addEventListener('url', this.handleDeepLink)

      return () => subscription?.remove()
    } catch (error) {
      console.error('DeepLinkService: Error initializing deep linking:', error)
    }
  }

  /**
   * Handle incoming deep links (warm start / app already open).
   */
  private handleDeepLink = (event: { url: string }): void => {
    try {
      if (__DEV__) {
        console.log('DeepLinkService: Received deep link:', event.url)
      }
      if (isSupabaseOauthAppCallback(event.url)) {
        return
      }
      void this.consumeUrl(event.url)
    } catch (error) {
      console.error('DeepLinkService: Error handling deep link:', error)
    }
  }

  /** Stash intent and navigate when MainStack is ready. */
  async consumeUrl(url: string): Promise<void> {
    analytics.trackDeepLinkOpened({ url })
    await stashPendingDeepLinkFromUrl(url)
    flushPendingDeepLinkNavigation(
      (global as any).rootNavigationRef?.current as NavigationContainerRef<unknown> | null,
    )
  }

  /**
   * Parse URL to extract screen and parameters
   */
  parseUrl(url: string): DeepLinkData {
    const pending = parseDeepLinkFromUrl(url)
    if (!pending) {
      return { screen: 'Dashboard' }
    }
    return { screen: pending.screen, params: pending.params }
  }

  /**
   * Create a deep link URL
   */
  createDeepLink(screen: string, params: Record<string, string> = {}): string {
    try {
      const baseUrl = APP_URLS.app

      const screenMap: Record<string, string> = {
        Dashboard: '/user/dashboard',
        Transactions: '/user/transactions',
        TransactionDetails: '/user/transactions',
        Recipients: '/user/recipients',
        SendAmount: '/user/send',
        Support: '/user/support',
        Profile: '/user/profile',
        Notifications: '/user/notifications',
      }

      let path = screenMap[screen] || '/user/dashboard'

      if (screen === 'TransactionDetails' && params.transactionId) {
        path += `/${params.transactionId}`
      }

      return `${baseUrl}${path}`
    } catch (error) {
      console.error('DeepLinkService: Error creating deep link:', error)
      return `${APP_URLS.app}/user/dashboard`
    }
  }

  /**
   * Check if the app can handle a URL
   */
  canHandleUrl(url: string): boolean {
    try {
      if (url.includes('easner://')) return true
      const parsed = new URL(url)
      return isMobileDeepLinkHost(parsed.hostname)
    } catch (error) {
      console.error('DeepLinkService: Error checking URL:', error)
      return false
    }
  }
}

export const deepLinkService = DeepLinkService.getInstance()
