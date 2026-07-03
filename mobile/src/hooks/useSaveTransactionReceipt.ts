import { useCallback, useState, type RefObject } from 'react'
import { Platform } from 'react-native'
import type { View } from 'react-native'
import { useToast } from '../components/ToastProvider'

/**
 * Captures the off-screen `TransactionReceiptCard` to a PNG and either saves it to the
 * device Photos (via expo-media-library) or hands it to the native share sheet. Image only —
 * the business web app keeps the PDF receipt.
 *
 * IMPORTANT: the native deps (react-native-view-shot, expo-media-library, expo-sharing) are
 * loaded lazily via `require` inside the handlers, NOT with top-level `import`. This screen is
 * imported eagerly by AppNavigator, so a top-level import of a native module that is missing or
 * ABI-mismatched would throw during module evaluation and hard-crash the app at launch (no
 * redbox in production). Lazy-loading confines any such failure to the moment the user taps
 * Save/Share, where we can show a toast instead.
 */
export function useSaveTransactionReceipt(ref: RefObject<View | null>) {
  const [saving, setSaving] = useState(false)
  const { showSuccess, showError, showWarning } = useToast()

  const capture = useCallback(async (): Promise<string> => {
    if (!ref.current) throw new Error('Receipt is not ready yet.')
    const { captureRef } = require('react-native-view-shot')
    return captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' })
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

      // react-native-view-shot / media-library aren't meaningful on web — offer share/download instead.
      if (Platform.OS === 'web') {
        const shared = await shareUri(uri)
        if (!shared) showWarning('Open the Easner app on your phone to save receipts.')
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
