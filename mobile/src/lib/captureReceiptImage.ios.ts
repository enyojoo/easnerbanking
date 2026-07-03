import { findNodeHandle } from 'react-native'
import type { RefObject } from 'react'
import type { View } from 'react-native'
import type { ReceiptDetails } from '../components/receipt/receipt-types'
import EasnerViewCapture from '../../modules/easner-view-capture/src/EasnerViewCaptureModule'

/**
 * iOS: UIKit snapshot via local Expo module (react-native-view-shot crashes at launch when linked).
 * Returns a tmpfile path to a device-scale PNG.
 */
export async function captureReceiptImage(
  ref: RefObject<View | null>,
  _receipt: ReceiptDetails | null,
): Promise<string> {
  if (!ref.current) throw new Error('Receipt is not ready yet.')
  const tag = findNodeHandle(ref.current)
  if (tag == null) throw new Error('Receipt is not ready yet.')
  return EasnerViewCapture.captureView(tag)
}
