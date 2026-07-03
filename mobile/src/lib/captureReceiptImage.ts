import type { RefObject } from 'react'
import type { View } from 'react-native'

/**
 * Native (iOS + Android): react-native-view-shot captures at the device pixel density,
 * so the PNG is as sharp as the screen. Returns a tmpfile path.
 */
export async function captureReceiptImage(ref: RefObject<View | null>): Promise<string> {
  if (!ref.current) throw new Error('Receipt is not ready yet.')
  const { captureRef } = require('react-native-view-shot')
  return captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' })
}
