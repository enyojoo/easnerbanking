import { useCallback } from 'react'
import * as Clipboard from 'expo-clipboard'
import { useToast } from '../components/ToastProvider'
import { haptics } from '../lib/haptics'

/** Copy text with toast on failure; light haptic on success. */
export function useCopyToClipboard() {
  const { showError } = useToast()

  return useCallback(
    async (text: string) => {
      try {
        await Clipboard.setStringAsync(text)
        haptics.tap()
        return true
      } catch {
        showError('Failed to copy to clipboard')
        return false
      }
    },
    [showError],
  )
}
