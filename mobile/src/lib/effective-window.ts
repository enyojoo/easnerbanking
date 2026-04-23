import { Dimensions, Platform } from 'react-native'

export const MAC_INSTALLED_MOBILE_DESIGN_POINTS = {
  width: 428,
  height: 926,
} as const

export function isIosOnMac(): boolean {
  if (Platform.OS !== 'ios') return false
  const constants = (Platform as unknown as { constants?: Record<string, unknown> }).constants
  const c = constants ?? {}

  if (c.isMacCatalyst === true) return true
  if (c.interfaceIdiom === 'mac') return true
  if (c.systemName === 'macOS') return true
  return false
}

/**
 * On macOS running the iOS app (Catalyst / iOS-on-mac), the window can be very
 * wide which inflates our "responsive" typography + spacing scales. Clamp the
 * effective canvas to an iPhone Max logical size so the UI matches production.
 */
export function getEffectiveWindowPoints(input?: { width: number; height: number }): { width: number; height: number } {
  const raw = input ?? Dimensions.get('window')

  if (isIosOnMac()) {
    return {
      width: MAC_INSTALLED_MOBILE_DESIGN_POINTS.width,
      height: MAC_INSTALLED_MOBILE_DESIGN_POINTS.height,
    }
  }

  return { width: raw.width, height: raw.height }
}

