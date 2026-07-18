import type { LinkingOptions } from '@react-navigation/native'
import { getPathFromState as getPathFromStateDefault } from '@react-navigation/native'
import * as Linking from 'expo-linking'
import { shouldPreserveUserPathOverAuth } from './webLinkingGuard'

const prefix = Linking.createURL('/')

const NON_SERIALIZABLE_QUERY_KEYS = ['initialTransaction'] as const

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
      ReceiveMoney: 'user/receive',
      ReceiveBankDetails: 'user/receive/bank',
      ReceiveLocalRail: 'user/receive/local/rail',
      ReceiveLocalAmount: 'user/receive/local/amount',
      ReceiveLocalMomoSetup: 'user/receive/local/momo',
      ReceiveLocalReview: 'user/receive/local/review',
      YcPayIn: 'user/receive/local/payin',
      YcPayInAuthorize: 'user/receive/local/authorize',
      Recipients: 'user/recipients',
      Support: 'user/support',
      Profile: 'user/profile',
      Notifications: 'user/notifications',
      TransactionDetails: 'user/transactions/:transactionId',
    },
  },
}
