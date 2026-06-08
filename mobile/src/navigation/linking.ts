import type { LinkingOptions } from '@react-navigation/native'
import { getPathFromState as getPathFromStateDefault } from '@react-navigation/native'
import * as Linking from 'expo-linking'

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
    return stripNonSerializableQueryParams(getPathFromStateDefault(state, options))
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
      Recipients: 'user/recipients',
      Support: 'user/support',
      Profile: 'user/profile',
      TransactionDetails: 'user/transactions/:transactionId',
    },
  },
}
