import AsyncStorage from '@react-native-async-storage/async-storage'
import type { NavigationContainerRef } from '@react-navigation/native'
import { isMobileDeepLinkHost } from '@easner/shared'
import { storePayrollApprovalToken } from './payrollApprovalTokenStore'

const STORAGE_KEY = '@easner_pending_deep_link_v1'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export type PendingDeepLinkPayload = {
  at: number
  screen: string
  params?: Record<string, string>
}

/** Do not treat Supabase / Google OAuth return URLs as in-app deep links. */
export function isSupabaseOauthAppCallback(url: string): boolean {
  if (url.includes('auth/callback')) return true
  if (url.includes('access_token=') || url.includes('refresh_token=') || /(^|[?#&])code=/.test(url)) {
    return /easner|exp\+|exp:\/\//.test(url)
  }
  return false
}

export function isUserDeepLinkUrl(url: string): boolean {
  if (isSupabaseOauthAppCallback(url)) return false

  if (/^easner:\/\//.test(url)) {
    const rest = url.replace(/^easner:\/\//, '').split('?')[0]?.split('#')[0] ?? ''
    const path = rest.startsWith('/') ? rest : `/${rest}`
    return path === '/payroll' || path.startsWith('/payroll/') || path === '/user' || path.startsWith('/user/')
  }

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    if (!isMobileDeepLinkHost(parsed.hostname)) return false
    const path = parsed.pathname
    return path === '/payroll' || path.startsWith('/payroll/') || path === '/user' || path.startsWith('/user/')
  } catch {
    return false
  }
}

export function parseDeepLinkFromUrl(url: string): PendingDeepLinkPayload | null {
  if (!isUserDeepLinkUrl(url)) return null

  try {
    const cleanUrl = /^easner:\/\//.test(url)
      ? `/${url.replace(/^easner:\/\//, '').split('?')[0]?.split('#')[0] ?? ''}`
      : new URL(url).pathname
    const segments = cleanUrl.split('/').filter(Boolean)

    if (segments[0] === 'payroll') {
      return { at: Date.now(), screen: 'PayrollApproval' }
    }

    if (segments.length === 0) {
      return { at: Date.now(), screen: 'Dashboard' }
    }

    const screenMap: Record<string, string> = {
      user: 'Dashboard',
      'user/dashboard': 'Dashboard',
      'user/transactions': 'Transactions',
      'user/recipients': 'Recipients',
      'user/send': 'SendAmount',
      'user/support': 'Support',
      'user/profile': 'Profile',
      'user/notifications': 'Notifications',
    }

    let screen = screenMap[segments.join('/')]
    let params: Record<string, string> | undefined

    if (segments[0] === 'user' && segments[1] === 'transactions' && segments[2]) {
      screen = 'TransactionDetails'
      params = { transactionId: segments[2], fromScreen: 'DeepLink' }
    }

    if (!screen) {
      screen = 'Dashboard'
    }

    return { at: Date.now(), screen, params }
  } catch {
    return { at: Date.now(), screen: 'Dashboard' }
  }
}

async function loadPending(): Promise<PendingDeepLinkPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingDeepLinkPayload
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

export async function stashPendingDeepLinkFromUrl(url: string): Promise<void> {
  const pending = parseDeepLinkFromUrl(url)
  if (!pending) return
  try {
    if (pending.screen === 'PayrollApproval') {
      const token = new URL(url).searchParams.get('token')
      if (token) await storePayrollApprovalToken(token)
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pending))
  } catch (e) {
    console.warn('stashPendingDeepLinkFromUrl:', e)
  }
}

function isPushNavMainReady(): boolean {
  return Boolean((global as any).easnerPushNavReady)
}

function navigateToDeepLinkScreen(
  navigationRef: NavigationContainerRef<unknown>,
  pending: PendingDeepLinkPayload,
): void {
  const params = pending.params ?? {}

  switch (pending.screen) {
    case 'Dashboard':
      navigationRef.navigate('MainTabs' as never, { screen: 'Dashboard' } as never)
      break
    case 'Transactions':
      navigationRef.navigate('MainTabs' as never, { screen: 'Transactions' } as never)
      break
    case 'SendAmount':
      navigationRef.navigate('SendAmount' as never, {} as never)
      break
    case 'Recipients':
      navigationRef.navigate('Recipients' as never, {} as never)
      break
    case 'Support':
      navigationRef.navigate('Support' as never, {} as never)
      break
    case 'Profile':
      navigationRef.navigate('Profile' as never, {} as never)
      break
    case 'Notifications':
      navigationRef.navigate('Notifications' as never, {} as never)
      break
    case 'TransactionDetails':
      navigationRef.navigate('TransactionDetails' as never, params as never)
      break
    case 'PayrollApproval':
      navigationRef.navigate('PayrollApproval' as never, {} as never)
      break
    default:
      navigationRef.navigate('MainTabs' as never, { screen: 'Dashboard' } as never)
      break
  }
}

/** Navigate once MainStack is active (PIN unlocked), same gate as push notification taps. */
export function flushPendingDeepLinkNavigation(
  navigationRef: NavigationContainerRef<unknown> | null | undefined,
): void {
  if (!isPushNavMainReady()) return
  if (!navigationRef?.isReady()) return

  void (async () => {
    const pending = await loadPending()
    if (!pending) return

    try {
      navigateToDeepLinkScreen(navigationRef, pending)
      await clearPending()
    } catch (e) {
      console.warn('flushPendingDeepLinkNavigation:', e)
    }
  })()
}
