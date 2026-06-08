import { Platform } from 'react-native'
import { blurActiveElementOnWeb } from '../lib/webFocus'

/** Params safe for React Navigation web linking (no non-serializable objects in the URL). */
export function transactionDetailsParams<T extends Record<string, unknown>>(params: T): T {
  if (Platform.OS !== 'web') return params
  const { initialTransaction: _ignored, ...rest } = params
  return rest as T
}

/** Blur the list row, then return params for TransactionDetails navigation. */
export function prepareTransactionDetailsNavigation<T extends Record<string, unknown>>(
  params: T,
): T {
  blurActiveElementOnWeb()
  return transactionDetailsParams(params)
}
