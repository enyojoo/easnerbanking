import type { RefObject } from 'react'
import type { View } from 'react-native'
import type { ReceiptDetails } from '../components/receipt/receipt-types'

/**
 * Web: react-native-view-shot delegates to html2canvas, which defaults to
 * window.devicePixelRatio – soft on low-DPI screens. Call html2canvas directly at an
 * explicit high scale so the downloaded/shared PNG (logo + text) stays crisp everywhere.
 * On react-native-web a View ref resolves to the underlying DOM node.
 */
export async function captureReceiptImage(
  ref: RefObject<View | null>,
  _receipt: ReceiptDetails | null,
): Promise<string> {
  const node = ref.current as unknown as HTMLElement | null
  if (!node) throw new Error('Receipt is not ready yet.')
  const html2canvas = (await import('html2canvas')).default
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const canvas = await html2canvas(node, {
    useCORS: true,
    backgroundColor: null,
    scale: Math.max(dpr, 3),
  })
  return canvas.toDataURL('image/png')
}
