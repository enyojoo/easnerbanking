import React from 'react'
import { View, StyleSheet } from 'react-native'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import type { Recipient } from '../../types'
import { useFixedFooterPadding, useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'
import { spacing } from '../../theme'
import { YcCrossBorderMomoSetup } from '../../components/yc/YcCrossBorderMomoSetup'
import { residenceCountryFromPayInCurrency } from '../../hooks/useYcCrossBorderFlow'

type RouteParams = {
  recipient?: Recipient
  ycPayInCurrency?: string
  receiveAmountValue?: number
  receiveCurrency?: string
  amountEntryMode?: 'send' | 'receive'
  amountScreenSendAmount?: number
  note?: string
  paymentPurpose?: string
  crossBorderProvider?: 'yellowcard' | 'grid'
}

export default function SendCrossBorderMomoSetupScreen({ navigation, route }: NavigationProps) {
  const scrollBottomPadding = useScrollBottomPadding(spacing[5])
  const footerPadding = useFixedFooterPadding(spacing[5])
  const params = (route.params || {}) as Partial<RouteParams>
  const recipient = params.recipient
  const payInCurrency = params.ycPayInCurrency ?? ''
  const payInCountry = payInCurrency ? residenceCountryFromPayInCurrency(payInCurrency) ?? '' : ''

  if (!recipient || !payInCurrency || !payInCountry) {
    navigation.goBack()
    return null
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <YcCrossBorderMomoSetup
          navigation={navigation}
          recipient={recipient}
          payInCurrency={payInCurrency}
          payInCountry={payInCountry}
          receiveAmount={params.receiveAmountValue ?? 0}
          receiveCurrency={params.receiveCurrency ?? recipient.currency ?? ''}
          amountEntryMode={params.amountEntryMode ?? 'receive'}
          amountScreenSendAmount={params.amountScreenSendAmount ?? 0}
          note={params.note}
          paymentPurpose={params.paymentPurpose}
          crossBorderProvider={params.crossBorderProvider}
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
