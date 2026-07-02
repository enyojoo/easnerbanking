import { useCallback, useState, type RefObject } from 'react'
import { Platform } from 'react-native'
import type { View } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import * as MediaLibrary from 'expo-media-library'
import * as Sharing from 'expo-sharing'
import { useToast } from '../components/ToastProvider'

/**
 * Captures the off-screen `TransactionReceiptCard` to a PNG and either saves it to the
 * device Photos (via expo-media-library) or hands it to the native share sheet. Image only —
 * the business web app keeps the PDF receipt.
 */
export function useSaveTransactionReceipt(ref: RefObject<View | null>) {
  const [saving, setSaving] = useState(false)
  const { showSuccess, showError, showWarning } = useToast()

  const capture = useCallback(async (): Promise<string> => {
    if (!ref.current) throw new Error('Receipt is not ready yet.')
    return captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' })
  }, [ref])

  const shareUri = useCallback(async (uri: string): Promise<boolean> => {
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
