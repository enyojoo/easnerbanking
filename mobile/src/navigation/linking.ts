import type { LinkingOptions } from '@react-navigation/native'
import * as Linking from 'expo-linking'

const prefix = Linking.createURL('/')

export const webLinking: LinkingOptions<Record<string, unknown>> = {
  prefixes: [prefix, 'https://app.easner.com', 'https://easner-web.vercel.app'],
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
