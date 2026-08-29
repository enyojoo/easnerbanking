import { Keyboard } from 'react-native'
import { CommonActions, StackActions } from '@react-navigation/native'
import { inferRecipientFormType } from './recipientForm'
import type { RecipientFormType } from './recipientForm'
import type { Recipient } from '../types'

export const RECIPIENT_FORM_ROUTE_BY_TYPE = {
  bank: 'AddBankRecipient',
  mobile: 'AddMobileRecipient',
  wallet: 'AddWalletRecipient',
  easenet: 'AddEasenetRecipient',
} as const

export type RecipientFormRouteName = (typeof RECIPIENT_FORM_ROUTE_BY_TYPE)[RecipientFormType]

export const RECIPIENT_FORM_ROUTE_NAMES: readonly RecipientFormRouteName[] = [
  'AddBankRecipient',
  'AddMobileRecipient',
  'AddWalletRecipient',
  'AddEasenetRecipient',
]

export type RecipientFormMode = 'draft' | 'persist'

export type RecipientFormSharedParams = {
  mode: RecipientFormMode
  preferredBalanceCurrency?: string
  selectedPaymentMethod?: 'balance' | 'linkBank' | 'virtualBank' | 'otherCurrency'
  selectedOtherCurrency?: string | null
  selectedOtherPaymentMethod?: string | null
  recipient?: Recipient
  scannedWalletAddress?: string
}

type StackRoute = {
  name: string
  key?: string
  params?: Record<string, unknown>
  state?: unknown
}

type StackNavigationLike = {
  canGoBack?: () => boolean
  goBack?: () => void
  getParent?: () => StackNavigationLike | undefined
  getState: () => { index: number; routes: StackRoute[] }
  dispatch: (action: unknown) => void
  navigate: (...args: unknown[]) => void
}

/** In-memory send-amount entry so web linking can drop `/user/send` query objects. */
let pendingSendAmountParams: Record<string, unknown> | null = null

export function stashPendingSendAmountParams(params: Record<string, unknown>): void {
  pendingSendAmountParams = params
}

export function consumePendingSendAmountParams(): Record<string, unknown> | null {
  const next = pendingSendAmountParams
  pendingSendAmountParams = null
  return next
}

function findStackWithRoute(
  navigation: StackNavigationLike,
  routeName: string,
): { navigation: StackNavigationLike; index: number; routes: StackRoute[] } | null {
  let nav: StackNavigationLike | undefined = navigation
  while (nav) {
    const state = nav.getState?.()
    const routes = state?.routes
    if (routes?.some((route) => route.name === routeName)) {
      return { navigation: nav, index: state.index, routes }
    }
    nav = nav.getParent?.()
  }
  return null
}

export function recipientFormRouteForType(type: RecipientFormType): RecipientFormRouteName {
  return RECIPIENT_FORM_ROUTE_BY_TYPE[type]
}

export function isRecipientFormRoute(name: string | undefined): boolean {
  return Boolean(name && (RECIPIENT_FORM_ROUTE_NAMES as readonly string[]).includes(name))
}

export function navigateToAddRecipient(
  navigation: StackNavigationLike,
  params: RecipientFormSharedParams,
): void {
  Keyboard.dismiss()
  navigation.navigate('AddRecipientType' as never, params as never)
}

export function navigateToEditRecipient(
  navigation: StackNavigationLike,
  recipient: Recipient,
  params: Omit<RecipientFormSharedParams, 'recipient'> = { mode: 'persist' },
): void {
  Keyboard.dismiss()
  const type = inferRecipientFormType(recipient)
  navigation.navigate(recipientFormRouteForType(type) as never, { ...params, recipient } as never)
}

export function navigateToRecipientFormRail(
  navigation: StackNavigationLike,
  type: RecipientFormType,
  params: RecipientFormSharedParams,
): void {
  navigation.dispatch(StackActions.push(recipientFormRouteForType(type), params))
}

/**
 * Pop type + form so back from SendAmount returns to the send hub.
 * Do not CommonActions.reset: on web, linking rehydrates `/user/send` from the
 * URL and drops the in-memory recipient (looks like a reload with an empty amount screen).
 */
export function collapseRecipientFormToSendAmount(
  navigation: StackNavigationLike,
  sendAmountParams: Record<string, unknown>,
): void {
  stashPendingSendAmountParams(sendAmountParams)
  const hub = findStackWithRoute(navigation, 'SelectRecentRecipient')
  if (hub) {
    let hubIdx = -1
    for (let i = hub.index; i >= 0; i--) {
      if (hub.routes[i]?.name === 'SelectRecentRecipient') {
        hubIdx = i
        break
      }
    }
    if (hubIdx >= 0 && hub.index > hubIdx) {
      hub.navigation.dispatch(StackActions.pop(hub.index - hubIdx))
    }
    hub.navigation.navigate('SendAmount' as never, sendAmountParams as never)
    return
  }

  navigation.navigate('SendAmount' as never, sendAmountParams as never)
}

/** Leave add/edit form (and type picker) and land on Recipients or the send hub. */
export function popRecipientFormToList(navigation: StackNavigationLike): void {
  const state = navigation.getState()
  const routes = state?.routes
  if (!routes?.length) {
    navigation.goBack?.()
    return
  }

  const idx = state.index
  for (let i = idx; i >= 0; i--) {
    const name = routes[i]?.name
    if (name === 'Recipients' || name === 'SelectRecentRecipient') {
      const popCount = idx - i
      if (popCount > 0) navigation.dispatch(StackActions.pop(popCount))
      return
    }
  }

  if (navigation.canGoBack?.()) {
    navigation.goBack()
    return
  }
  navigation.goBack?.()
}

/** Write a scanned address onto AddWalletRecipient (the form under ScanWalletAddress). */
export function applyScannedWalletAddressToForm(
  navigation: StackNavigationLike,
  address: string,
): void {
  const state = navigation.getState()
  const routes = state?.routes
  if (!routes?.length) {
    navigation.goBack?.()
    return
  }

  const walletRoute =
    [...routes].reverse().find((route) => route.name === 'AddWalletRecipient') ??
    (routes.length >= 2 ? routes[routes.length - 2] : undefined)

  if (walletRoute?.key) {
    navigation.dispatch(
      CommonActions.setParams({
        key: walletRoute.key,
        params: { scannedWalletAddress: address },
      }),
    )
  }
  navigation.goBack?.()
}
