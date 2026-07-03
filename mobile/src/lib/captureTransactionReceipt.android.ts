import type { RefObject } from 'react'
import type { View } from 'react-native'
import type { ReceiptDetails } from '../components/receipt/receipt-types'

/** Android: capture the on-screen receipt card to a PNG via react-native-view-shot. */
export async function captureTransactionReceipt(
  ref: RefObject<View | null>,
  _receipt: ReceiptDetails | null,
): Promise<string> {
  if (!ref.current) throw new Error('Receipt is not ready yet.')
  let captureRef: (view: unknown, options: object) => Promise<string>
  try {
    ;({ captureRef } = require('react-native-view-shot'))
  } catch {
    throw new Error('Receipt capture is unavailable on this build.')
  }
  return captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' })
}
