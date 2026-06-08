import { Platform } from 'react-native'

/** Drop DOM focus on web before/after stack transitions (avoids aria-hidden warnings). */
export function blurActiveElementOnWeb(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return
  const active = document.activeElement
  if (active instanceof HTMLElement) {
    active.blur()
  }
}

/**
 * Mirror React Navigation's web fix: apply `inert` to aria-hidden stack cards so
 * inactive screens cannot retain focus during animated transitions.
 */
export function reconcileWebStackInert(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return

  const active = document.activeElement
  const hiddenRoots = document.querySelectorAll<HTMLElement>('[aria-hidden="true"]')

  hiddenRoots.forEach((el) => {
    el.setAttribute('inert', '')
    if (active instanceof HTMLElement && el.contains(active)) {
      active.blur()
    }
  })

  document.querySelectorAll<HTMLElement>('[aria-hidden="false"]').forEach((el) => {
    el.removeAttribute('inert')
  })
}
