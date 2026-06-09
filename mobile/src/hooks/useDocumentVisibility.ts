import { useEffect, useState } from 'react'
import { Platform } from 'react-native'

/**
 * True when the browser tab is visible. Pauses polling-heavy refetch intervals
 * while backgrounded (business parity).
 */
export function useDocumentVisibility(): boolean {
  const [visible, setVisible] = useState(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return true
    return !document.hidden
  })

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return
    const onVis = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  return visible
}
