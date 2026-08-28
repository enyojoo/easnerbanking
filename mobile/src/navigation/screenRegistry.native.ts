import * as React from 'react'
import type { ComponentType } from 'react'

/**
 * Native screen registry (M2.5): flow screens load via `require()` inside the
 * wrapper's first render instead of a static top-level import.
 *
 * Send hub + Recipients are warmed via require() in preloadMainStackScreens()
 * after nav is ready (App.tsx AppContent) — not on first navigation tap (iOS
 * crash) and not via navigation.preload (off-screen mount crash post-PIN).
 */
function lazyNativeScreen<P extends object>(
  load: () => { default: ComponentType<P> },
): ComponentType<P> {
  let Loaded: ComponentType<P> | null = null
  function LazyNativeScreen(props: P) {
    if (!Loaded) {
      Loaded = load().default
    }
    return React.createElement(Loaded, props)
  }
  return LazyNativeScreen as ComponentType<P>
}

export const SelectRecentRecipientScreen = lazyNativeScreen(
  () => require('../screens/send/SelectRecentRecipientScreen'),
)
export const RecipientsScreen = lazyNativeScreen(
  () => require('../screens/main/RecipientsScreen'),
)
export const SendAmountScreen = lazyNativeScreen(
  () => require('../screens/send/SendAmountScreen'),
)
export const ScanWalletAddressScreen = lazyNativeScreen(
  () => require('../screens/recipients/ScanWalletAddressScreen'),
)
export const SelectRecipientScreen = lazyNativeScreen(
  () => require('../screens/send/SelectRecipientScreen'),
)
export const SendConfirmScreen = lazyNativeScreen(
  () => require('../screens/send/SendConfirmScreen'),
)
export const SendCrossBorderMomoSetupScreen = lazyNativeScreen(
  () => require('../screens/send/SendCrossBorderMomoSetupScreen'),
)
export const SendPinScreen = lazyNativeScreen(
  () => require('../screens/send/SendPinScreen'),
)
export const CardScreen = lazyNativeScreen(
  () => require('../screens/main/CardScreen'),
)
export const ReceiveMoneyScreen = lazyNativeScreen(
  () => require('../screens/receive/ReceiveMoneyScreen'),
)
export const ReceiveBankDetailsScreen = lazyNativeScreen(
  () => require('../screens/receive/ReceiveBankDetailsScreen'),
)
export const ReceiveStablecoinDetailsScreen = lazyNativeScreen(
  () => require('../screens/receive/ReceiveStablecoinDetailsScreen'),
)
export const ReceiveLocalRailScreen = lazyNativeScreen(
  () => require('../screens/receive/ReceiveLocalRailScreen'),
)
export const ReceiveLocalAmountScreen = lazyNativeScreen(
  () => require('../screens/receive/ReceiveLocalAmountScreen'),
)
export const ExpressDepositAmountScreen = lazyNativeScreen(
  () => require('../screens/receive/ExpressDepositAmountScreen'),
)
export const ExpressDepositsSetupScreen = lazyNativeScreen(
  () => require('../screens/verification/ExpressDepositsSetupScreen'),
)
export const ReceiveLocalReviewScreen = lazyNativeScreen(
  () => require('../screens/receive/ReceiveLocalReviewScreen'),
)
export const ReceiveLocalMomoSetupScreen = lazyNativeScreen(
  () => require('../screens/receive/ReceiveLocalMomoSetupScreen'),
)
export const ReceiveTransactionDetailsScreen = lazyNativeScreen(
  () => require('../screens/receive/ReceiveTransactionDetailsScreen'),
)
export const AccountVerificationScreen = lazyNativeScreen(
  () => require('../screens/verification/AccountVerificationScreen'),
)
