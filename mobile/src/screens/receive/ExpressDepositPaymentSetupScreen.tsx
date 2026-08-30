import React, { useCallback, useEffect, useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import { parseExpressDepositFlowParams } from '@easner/shared'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { useFixedFooterPadding } from '../../hooks/useScrollBottomPadding'
import { spacing } from '../../theme'
import { ExpressDepositsPaymentSetup } from '../../components/receive/ExpressDepositsPaymentSetup'
import { useStackHardwareBack } from '../../hooks/useStackHardwareBack'
import { navigateStackBack } from '../../navigation/stackBackNavigation'

export default function ExpressDepositPaymentSetupScreen({ navigation, route }: NavigationProps) {
  const footerPadding = useFixedFooterPadding(spacing[5])
  const params = useMemo(() => parseExpressDepositFlowParams(route.params), [route.params])
  const handleBack = useCallback(() => navigateStackBack(navigation), [navigation])
  useStackHardwareBack(handleBack)

  useEffect(() => {
    if (!params) navigateStackBack(navigation)
  }, [navigation, params])

  if (!params) return null

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <ExpressDepositsPaymentSetup
          navigation={navigation}
          params={params}
          footerPadding={footerPadding}
        />
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
})
