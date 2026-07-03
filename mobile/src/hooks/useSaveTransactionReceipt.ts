import { useCallback, useState, type RefObject } from 'react'
import { Platform } from 'react-native'
import type { View } from 'react-native'
import type { ReceiptDetails } from '../components/receipt/receipt-types'
import { useToast } from '../components/ToastProvider'
import { captureReceiptImage } from '../lib/captureReceiptImage'

const RECEIPT_FILENAME = 'easner-receipt.png'

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl)
  return response.blob()
}

/** Web Share API rejects data: URLs — share a File, or download when sharing is unavailable. */
async function shareReceiptOnWeb(dataUrl: string): Promise<'shared' | 'downloaded' | 'unavailable'> {
  if (typeof navigator === 'undefined') return 'unavailable'

  const blob = await dataUrlToBlob(dataUrl)
  const file = new File([blob], RECEIPT_FILENAME, { type: 'image/png' })
  const payload: ShareData = { files: [file] }

  if (navigator.share && navigator.canShare && navigator.canShare(payload)) {
    try {
      await navigator.share(payload)
      return 'shared'
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return 'unavailable'
    }
  }

  await downloadReceiptOnWeb(dataUrl)
  return 'downloaded'
}

async function downloadReceiptOnWeb(dataUrl: string): Promise<void> {
  const blob = await dataUrlToBlob(dataUrl)
  const objectUrl = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = RECEIPT_FILENAME
    anchor.click()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Captures the on-screen receipt card to a PNG on iOS, Android, and web.
 * iOS uses a local UIKit snapshot module; Android uses react-native-view-shot.
 */
export function useSaveTransactionReceipt(
  ref: RefObject<View | null>,
  receipt: ReceiptDetails | null,
) {
  const [pendingAction, setPendingAction] = useState<'save' | 'share' | null>(null)
  const { showSuccess, showError, showWarning } = useToast()

  const capture = useCallback(() => captureReceiptImage(ref, receipt), [ref, receipt])

  const shareUri = useCallback(async (uri: string): Promise<boolean> => {
    const Sharing = require('expo-sharing')
    if (!(await Sharing.isAvailableAsync())) return false
    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      UTI: 'public.png',
      dialogTitle: 'Receipt',
    })
    return true
  }, [])

  const saveToPhotos = useCallback(async () => {
    if (pendingAction) return
    setPendingAction('save')
    try {
      const uri = await capture()

      if (Platform.OS === 'web') {
        await downloadReceiptOnWeb(uri)
        showSuccess('Receipt downloaded')
        return
      }

      const MediaLibrary = require('expo-media-library/legacy')
      const perm = await MediaLibrary.requestPermissionsAsync(true)
      if (!perm.granted) {
        showWarning('Allow photo access to save the receipt.')
        await shareUri(uri)
        return
      }

      await MediaLibrary.saveToLibraryAsync(uri)
      showSuccess('Receipt saved to Photos')
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Could not save receipt')
    } finally {
      setPendingAction(null)
    }
  }, [capture, pendingAction, shareUri, showSuccess, showError, showWarning])

  const shareReceipt = useCallback(async () => {
    if (pendingAction) return
    setPendingAction('share')
    try {
      const uri = await capture()
      setPendingAction(null)

      if (Platform.OS === 'web') {
        const outcome = await shareReceiptOnWeb(uri)
        if (outcome === 'shared') return
        if (outcome === 'downloaded') {
          showSuccess('Receipt downloaded')
          return
        }
        showWarning('Sharing is not available on this device.')
        return
      }

      const shared = await shareUri(uri)
      if (!shared) showWarning('Sharing is not available on this device.')
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Could not share receipt')
    } finally {
      setPendingAction(null)
    }
  }, [capture, pendingAction, shareUri, showError, showWarning])

  return { pendingAction, saveToPhotos, shareReceipt }
}
