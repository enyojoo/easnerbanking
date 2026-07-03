import type { RefObject } from 'react'
import type { View } from 'react-native'
import type { ReceiptDetails } from '../components/receipt/receipt-types'

/** Web fallback — share flow is handled in the hook. */
export async function captureTransactionReceipt(
  _ref: RefObject<View | null>,
  _receipt: ReceiptDetails | null,
): Promise<string> {
  throw new Error('Receipt capture is only available in the native app.')
}
