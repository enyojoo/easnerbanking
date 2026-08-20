import React, { useEffect } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { colors } from '../../theme'
import type { NgLocalIdType } from '@easner/shared'
import type { YcPayInRail } from '../../hooks/useYcCrossBorderFlow'

type RouteParams = {
  localPayInCurrency?: string
  residenceCountry?: string
  payInRail?: YcPayInRail
  ngMissingType?: NgLocalIdType | null
}

/** Deprecated rail picker – redirects to Receive Cash hub or amount entry when deep-linked. */
export default function ReceiveLocalRailScreen({ navigation, route }: NavigationProps) {
  useEffect(() => {
    const params = (route.params || {}) as Partial<RouteParams>
    const { localPayInCurrency, residenceCountry, payInRail } = params

    if (localPayInCurrency && residenceCountry && payInRail) {
      navigation.replace('ReceiveLocalAmount' as never, {
        localPayInCurrency,
        residenceCountry,
        payInRail,
        ngMissingType: params.ngMissingType ?? null,
      } as never)
      return
    }

    navigation.replace('ReceiveMoney' as never, { currency: 'USD' } as never)
  }, [navigation, route.params])

  return (
    <ScreenWrapper>
      <View style={styles.loader}>
        <ActivityIndicator color={colors.primary.main} />
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
