/**
 * Warm MainStack screen modules off the navigation critical path (M2.5 lazy registry).
 * Call from Send / transaction row `onPressIn` only — not from Dashboard idle effects.
 * `navigation.preload()` for these screens mounts them off-screen and has crashed iOS
 * release builds right after PIN unlock; module `require()` here avoids that while
 * still trimming first-tap jank.
 */
let didPreload = false

export function preloadMainStackScreens(): void {
  if (didPreload) return
  didPreload = true
  try {
    require('../screens/send/SelectRecentRecipientScreen')
    require('../screens/send/SendAmountScreen')
    require('../screens/main/RecipientsScreen')
    require('../screens/transactions/TransactionDetailsScreen')
  } catch (error) {
    didPreload = false
    console.warn('preloadMainStackScreens', error)
  }
}
