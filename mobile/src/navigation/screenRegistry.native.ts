import * as React from 'react'
import type { ComponentType } from 'react'

/**
 * Native screen registry (M2.5): each screen module is loaded via `require()`
 * inside the wrapper's first render instead of a static top-level import.
 *
 * The previous version statically imported every screen and passed it to
 * `createWebLazyScreen(importFn, NativeComponent)`. Because the imported value
 * was consumed at module-eval time, Metro's `inlineRequires` optimization was
 * defeated and all ~20 screen modules (send flow, receive flow, cards,
 * verification, …) executed during cold start. With `require()` deferred to
 * first render, a screen's module only evaluates when the screen is first
 * rendered (or preloaded via `navigation.preload`).
 *
 * This file is only resolved on native (Metro picks `.native.ts`); the web
 * bundle uses `screenRegistry.web.tsx` with `React.lazy` chunks, so no
 * `createWebLazyScreen` indirection is needed here.
 *
 * All screen modules below use default exports (verified against each module).
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

export const SendAmountScreen = lazyNativeScreen(
  () => require('../screens/send/SendAmountScreen'),
)
export const SelectRecentRecipientScreen = lazyNativeScreen(
  () => require('../screens/send/SelectRecentRecipientScreen'),
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
export const RecipientsScreen = lazyNativeScreen(
  () => require('../screens/main/RecipientsScreen'),
)
