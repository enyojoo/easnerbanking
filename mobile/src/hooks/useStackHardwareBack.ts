import { useEffect } from 'react'
import { BackHandler, Platform } from 'react-native'
import { navigateStackBack } from '../navigation/stackBackNavigation'

/**
 * Android hardware / gesture back — delegates to the same handler as the header back button.
 * Use on receive/send flow screens where stack pop must match visible back affordance.
 */
export function useStackHardwareBack(onBack: () => void, enabled = true): void {
  useEffect(() => {
    if (Platform.OS !== 'android' || !enabled) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack()
      return true
    })
    return () => sub.remove()
  }, [onBack, enabled])
}

/** Android hardware back wired to navigateStackBack (dedupes stack loops). */
export function useSmartStackHardwareBack(
  navigation: Parameters<typeof navigateStackBack>[0],
  options?: Parameters<typeof navigateStackBack>[1],
): void {
  useStackHardwareBack(() => navigateStackBack(navigation, options))
}
