import React, { lazy, Suspense, type ComponentType } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { colors } from '../theme'

function WebLazyFallback() {
  return (
    <View style={styles.fallback}>
      <ActivityIndicator size="small" color={colors.primary.main} />
    </View>
  )
}

function webLazy<P extends object>(importFn: () => Promise<{ default: ComponentType<P> }>) {
  const LazyComponent = lazy(importFn)
  function WebLazyScreen(props: P) {
    return (
      <Suspense fallback={<WebLazyFallback />}>
        <LazyComponent {...props} />
      </Suspense>
    )
  }
  return WebLazyScreen as ComponentType<P>
}

export const SendAmountScreen = webLazy(() => import('../screens/send/SendAmountScreen'))
export const SelectRecentRecipientScreen = webLazy(() => import('../screens/send/SelectRecentRecipientScreen'))
export const ScanWalletAddressScreen = webLazy(() => import('../screens/recipients/ScanWalletAddressScreen'))
export const SelectRecipientScreen = webLazy(() => import('../screens/send/SelectRecipientScreen'))
export const SendConfirmScreen = webLazy(() => import('../screens/send/SendConfirmScreen'))
export const SendCrossBorderMomoSetupScreen = webLazy(() => import('../screens/send/SendCrossBorderMomoSetupScreen'))
export const SendPinScreen = webLazy(() => import('../screens/send/SendPinScreen'))
export const CardScreen = webLazy(() => import('../screens/main/CardScreen'))
export const ReceiveMoneyScreen = webLazy(() => import('../screens/receive/ReceiveMoneyScreen'))
export const ReceiveBankDetailsScreen = webLazy(() => import('../screens/receive/ReceiveBankDetailsScreen'))
export const ReceiveStablecoinDetailsScreen = webLazy(() => import('../screens/receive/ReceiveStablecoinDetailsScreen'))
export const ReceiveLocalRailScreen = webLazy(() => import('../screens/receive/ReceiveLocalRailScreen'))
export const ReceiveLocalAmountScreen = webLazy(() => import('../screens/receive/ReceiveLocalAmountScreen'))
export const ExpressDepositAmountScreen = webLazy(() => import('../screens/receive/ExpressDepositAmountScreen'))
export const ExpressDepositsSetupScreen = webLazy(() => import('../screens/verification/ExpressDepositsSetupScreen'))
export const ReceiveLocalReviewScreen = webLazy(() => import('../screens/receive/ReceiveLocalReviewScreen'))
export const ReceiveLocalMomoSetupScreen = webLazy(() => import('../screens/receive/ReceiveLocalMomoSetupScreen'))
export const ReceiveTransactionDetailsScreen = webLazy(() => import('../screens/receive/ReceiveTransactionDetailsScreen'))
export const AccountVerificationScreen = webLazy(() => import('../screens/verification/AccountVerificationScreen'))
export const RecipientsScreen = webLazy(() => import('../screens/main/RecipientsScreen'))

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.primary,
  },
})
