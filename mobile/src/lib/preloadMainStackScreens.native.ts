/**
 * Warm Send / Recipients / amount / transaction-detail modules off the
 * navigation critical path.
 *
 * Call from Send / Recipients / row `onPressIn` only.
 * Do not call from App.tsx `navReady` or Dashboard idle effects — that
 * `require()` during first mount has SIGABRT'd release iOS (builds 216, 220).
 * `navigation.preload()` for these screens mounts them off-screen and has
 * also crashed iOS after PIN unlock.
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
