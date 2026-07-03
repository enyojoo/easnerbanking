import { useCallback, useState, type RefObject } from 'react'
import { Platform } from 'react-native'
import type { View } from 'react-native'
import { useToast } from '../components/ToastProvider'

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

  if (navigator.share) {
    const payload: ShareData = { files: [file], title: 'Receipt' }
    if (!navigator.canShare || navigator.canShare(payload)) {
      try {
        await navigator.share(payload)
        return 'shared'
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return 'unavailable'
      }
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
 * Captures the on-screen `TransactionReceiptCard` to a PNG (both iOS and Android) and
 * either saves it to Photos (expo-media-library) or hands it to the native share sheet.
 * Consistent image receipt across platforms — the business web app keeps the PDF.
 *
 * Native deps (react-native-view-shot, expo-media-library, expo-sharing) are required
 * lazily inside the handlers, not at module scope, so nothing native runs until the
 * user taps Save/Share. The iOS 26 TurboModule launch-crash is fixed separately via
 * the react-native RCTTurboModule patch (patches/react-native+0.85.3.patch).
 */
export function useSaveTransactionReceipt(ref: RefObject<View | null>) {
  const [saving, setSaving] = useState(false)
  const { showSuccess, showError, showWarning } = useToast()

  const capture = useCallback(async (): Promise<string> => {
    if (!ref.current) throw new Error('Receipt is not ready yet.')
    const { captureRef } = require('react-native-view-shot')
    return captureRef(ref, {
      format: 'png',
      quality: 1,
      // Web returns a data: URL (tmpfile is aliased); native returns a file path.
      result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
    })
  }, [ref])

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
    if (saving) return
    setSaving(true)
    try {
      const uri = await capture()

      // view-shot returns a data: URL on web; expo-sharing passes it to navigator.share({ url })
      // which rejects non-http(s) URLs. Share via File API or download instead.
      if (Platform.OS === 'web') {
        await downloadReceiptOnWeb(uri)
        showSuccess('Receipt downloaded')
        return
      }

      // SDK 56 moved saveToLibraryAsync to the legacy entry — the main export throws at runtime.
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
      setSaving(false)
    }
  }, [capture, saving, shareUri, showSuccess, showError, showWarning])

  const shareReceipt = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      const uri = await capture()

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
      setSaving(false)
    }
  }, [capture, saving, shareUri, showError, showWarning])

  return { saving, saveToPhotos, shareReceipt }
}
