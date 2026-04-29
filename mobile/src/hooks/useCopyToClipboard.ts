import { useCallback } from 'react'
import * as Clipboard from 'expo-clipboard'
import { useToast } from '../components/ToastProvider'

/** Copy text with toast on failure (success uses haptics / local “copied” UI in callers). */
export function useCopyToClipboard() {
  const { showError } = useToast()

  return useCallback(
    async (text: string) => {
      try {
        await Clipboard.setStringAsync(text)
        return true
      } catch {
        showError('Failed to copy to clipboard')
        return false
      }
    },
    [showError],
  )
}
