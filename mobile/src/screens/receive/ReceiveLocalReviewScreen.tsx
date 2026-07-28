import React, { useCallback } from 'react'
import { View, StyleSheet } from 'react-native'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { useFixedFooterPadding, useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'
import { spacing } from '../../theme'
import { YcFundBalanceReview } from '../../components/receive/YcFundBalanceReview'
import type { YcPayInRail } from '../../hooks/useYcCrossBorderFlow'
import { useStackHardwareBack } from '../../hooks/useStackHardwareBack'
import { navigateStackBack } from '../../navigation/stackBackNavigation'

type RouteParams = {
  localPayInCurrency: string
  residenceCountry: string
  payInRail: YcPayInRail
  amountEntryMode: 'usd' | 'local'
  enteredAmount: number
  usdCredit: number
  localPayIn: number
  customerRate: number
  sourcePhone?: string
  networkId?: string
  sourceNetworkName?: string
}

export default function ReceiveLocalReviewScreen({ navigation, route }: NavigationProps) {
  const scrollBottomPadding = useScrollBottomPadding(spacing[5])
  const footerPadding = useFixedFooterPadding(spacing[5])
  const params = (route.params || {}) as Partial<RouteParams>
  const handleBack = useCallback(() => navigateStackBack(navigation), [navigation])
  useStackHardwareBack(handleBack)

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <YcFundBalanceReview
          navigation={navigation}
          localPayInCurrency={params.localPayInCurrency ?? ''}
          residenceCountry={params.residenceCountry ?? ''}
          payInRail={params.payInRail ?? 'bank_transfer'}
          amountEntryMode={params.amountEntryMode ?? 'usd'}
          enteredAmount={params.enteredAmount ?? 0}
          usdCredit={params.usdCredit ?? 0}
          localPayIn={params.localPayIn ?? 0}
          customerRate={params.customerRate ?? 0}
          sourcePhone={params.sourcePhone}
          networkId={params.networkId}
          sourceNetworkName={params.sourceNetworkName}
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
