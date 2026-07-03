import { useCallback, useState, type RefObject } from 'react'
import { Platform } from 'react-native'
import type { View } from 'react-native'
import type { ReceiptDetails } from '../components/receipt/receipt-types'
import { captureTransactionReceipt } from '../lib/captureTransactionReceipt'
import { useToast } from '../components/ToastProvider'

/**
 * Captures a receipt image (Android) or PDF (iOS) and saves/shares it.
 * Native capture modules are platform-split so iOS production builds do not link
 * react-native-view-shot / expo-media-library (those caused launch crashes).
 */
export function useSaveTransactionReceipt(
  ref: RefObject<View | null>,
  receipt: ReceiptDetails | null,
) {
  const [saving, setSaving] = useState(false)
  const { showSuccess, showError, showWarning } = useToast()

  const capture = useCallback(async (): Promise<string> => {
    return captureTransactionReceipt(ref, receipt)
  }, [ref, receipt])

  const shareUri = useCallback(async (uri: string): Promise<boolean> => {
    const Sharing = require('expo-sharing')
    if (!(await Sharing.isAvailableAsync())) return false
    const isPdf = Platform.OS === 'ios'
    await Sharing.shareAsync(uri, {
      mimeType: isPdf ? 'application/pdf' : 'image/png',
      UTI: isPdf ? 'com.adobe.pdf' : 'public.png',
      dialogTitle: 'Receipt',
    })
    return true
  }, [])

  const saveToPhotos = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      const uri = await capture()

      if (Platform.OS === 'web') {
        const shared = await shareUri(uri)
        if (!shared) showWarning('Open the Easner app on your phone to save receipts.')
        return
      }

      // iOS: no direct gallery write — share sheet includes Save to Files / Photos.
      if (Platform.OS === 'ios') {
        const shared = await shareUri(uri)
        if (!shared) showWarning('Sharing is not available on this device.')
        else showSuccess('Choose where to save your receipt')
        return
      }

      // Android: direct save to gallery via legacy media-library API.
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
