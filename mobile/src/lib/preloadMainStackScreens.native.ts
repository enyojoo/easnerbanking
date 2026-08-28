/**
 * Warm MainStack screen modules off the navigation critical path (M2.5 lazy registry).
 * First tap on Send / transaction rows otherwise pays a large sync `require()` during
 * the stack transition, which janks iOS and can race PostHog session-replay capture.
 */
let didPreload = false

export function preloadMainStackScreens(): void {
  if (didPreload) return
  didPreload = true
  try {
    require('../screens/send/SelectRecentRecipientScreen')
    require('../screens/send/SendAmountScreen')
    require('../screens/transactions/TransactionDetailsScreen')
  } catch (error) {
    didPreload = false
    console.warn('preloadMainStackScreens', error)
  }
}
