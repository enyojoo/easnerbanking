import type { LinkingOptions } from '@react-navigation/native'
import { getPathFromState as getPathFromStateDefault } from '@react-navigation/native'
import * as Linking from 'expo-linking'
import { shouldPreserveUserPathOverAuth } from './webLinkingGuard'

function resolveLinkingPrefix(): string {
  try {
    return Linking.createURL('/')
  } catch {
    // Tests and pre-manifest bootstrap can run before Expo Constants has loaded
    // the application scheme. Production still resolves through createURL.
    return 'easner:///'
  }
}

const prefix = resolveLinkingPrefix()

const NON_SERIALIZABLE_QUERY_KEYS = ['initialTransaction', 'existingMethod'] as const

function stripNonSerializableQueryParams(path: string): string {
  const qIndex = path.indexOf('?')
  if (qIndex === -1) return path
  const pathname = path.slice(0, qIndex)
  const search = path.slice(qIndex + 1)
  const params = new URLSearchParams(search)
  let changed = false
  for (const key of NON_SERIALIZABLE_QUERY_KEYS) {
    if (params.has(key)) {
      params.delete(key)
      changed = true
    }
  }
  if (!changed) return path
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

export const webLinking: LinkingOptions<Record<string, unknown>> = {
  prefixes: [prefix, 'https://app.easner.com', 'https://easner-web.vercel.app'],
  getPathFromState(state, options) {
    const path = stripNonSerializableQueryParams(getPathFromStateDefault(state, options))
    if (shouldPreserveUserPathOverAuth(path) && typeof window !== 'undefined') {
      const current = window.location.pathname.replace(/^\//, '')
      const search = window.location.search
      return search ? `${current}${search}` : current
    }
    return path
  },
  config: {
    screens: {
      MainTabs: {
        screens: {
          Dashboard: 'user/dashboard',
          Transactions: 'user/transactions',
          Card: 'user/cards',
          More: 'user/more',
        },
      },
      SendAmount: 'user/send',
      SelectRecentRecipient: 'user/send/recent',
      SelectRecipient: 'user/send/recipient',
      SendConfirm: 'user/send/confirm',
      SendPin: 'user/send/pin',
      SendCrossBorderMomoSetup: 'user/send/momo-setup',
      ScanWalletAddress: 'user/send/scan',
      ReceiveMoney: 'user/receive',
      ReceiveBankDetails: 'user/receive/bank',
      ReceiveStablecoinDetails: 'user/receive/stablecoin',
      ReceiveLocalRail: 'user/receive/local/rail',
      ReceiveLocalAmount: 'user/receive/local/amount',
      ExpressDepositAmount: 'user/receive/express/amount',
      ExpressDepositsSetup: 'user/verification/express',
      ReceiveLocalMomoSetup: 'user/receive/local/momo',
      ReceiveLocalReview: 'user/receive/local/review',
      ReceiveTransactionDetails: 'user/receive/transactions/:transactionId',
      Recipients: 'user/recipients',
      Support: 'user/support',
      Profile: 'user/profile',
      ChangePassword: 'user/profile/password',
      ChangePin: 'user/profile/pin',
      MfaSetup: 'user/profile/mfa',
      Legal: 'user/legal',
      AccountStatement: 'user/account-statement',
      Notifications: 'user/notifications',
      InAppNotifications: 'user/notifications/in-app',
      AccountVerification: 'user/verification',
      OpenCurrencyAccount: 'user/accounts/open',
      TransactionDetails: 'user/transactions/:transactionId',
      TransactionCard: 'user/transactions/card/:transactionId',
      PayrollApproval: 'payroll',
      PayrollConnections: 'payroll/connections',
      PayrollConnectionDetail: 'payroll/connections/:connectionId',
      PayrollInvitation: 'payroll/request',
      PayrollReceivingMethod: 'payroll/receiving-method',
    },
  },
}
