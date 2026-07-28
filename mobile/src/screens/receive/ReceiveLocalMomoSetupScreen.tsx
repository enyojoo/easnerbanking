import React, { useCallback } from 'react'
import { View, StyleSheet } from 'react-native'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { useFixedFooterPadding, useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'
import { spacing } from '../../theme'
import { YcFundBalanceMomoSetup } from '../../components/receive/YcFundBalanceMomoSetup'
import { useStackHardwareBack } from '../../hooks/useStackHardwareBack'
import { navigateStackBack } from '../../navigation/stackBackNavigation'

type RouteParams = {
  localPayInCurrency: string
  residenceCountry: string
  amountEntryMode: 'usd' | 'local'
  enteredAmount: number
  usdCredit: number
  localPayIn: number
  customerRate: number
}

export default function ReceiveLocalMomoSetupScreen({ navigation, route }: NavigationProps) {
  const scrollBottomPadding = useScrollBottomPadding(spacing[5])
  const footerPadding = useFixedFooterPadding(spacing[5])
  const params = (route.params || {}) as Partial<RouteParams>
  const handleBack = useCallback(() => navigateStackBack(navigation), [navigation])
  useStackHardwareBack(handleBack)

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <YcFundBalanceMomoSetup
          navigation={navigation}
          localPayInCurrency={params.localPayInCurrency ?? ''}
          residenceCountry={params.residenceCountry ?? ''}
          amountEntryMode={params.amountEntryMode ?? 'usd'}
          enteredAmount={params.enteredAmount ?? 0}
          usdCredit={params.usdCredit ?? 0}
          localPayIn={params.localPayIn ?? 0}
          customerRate={params.customerRate ?? 0}
          footerPadding={footerPadding}
          listBottomPadding={scrollBottomPadding}
        />
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
})
