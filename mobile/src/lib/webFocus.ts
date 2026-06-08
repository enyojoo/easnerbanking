import { Platform } from 'react-native'

/** Drop DOM focus on web before/after stack transitions (avoids aria-hidden warnings). */
export function blurActiveElementOnWeb(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return
  const active = document.activeElement
  if (active instanceof HTMLElement) {
    active.blur()
  }
}

