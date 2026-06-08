import { useEffect } from 'react'
import { Platform } from 'react-native'
import { reconcileWebStackInert } from '../lib/webFocus'

/** Keeps stack cards on web in sync with `inert` when React Navigation toggles aria-hidden. */
export function useWebStackA11yFix(): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return

    const observer = new MutationObserver(() => {
      reconcileWebStackInert()
    })

    observer.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['aria-hidden'],
    })

    reconcileWebStackInert()

    return () => observer.disconnect()
  }, [])
}
