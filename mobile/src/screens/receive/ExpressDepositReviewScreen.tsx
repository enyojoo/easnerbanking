import React, { useCallback, useEffect, useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import { parseExpressDepositFlowParams } from '@easner/shared'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { useFixedFooterPadding, useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'
import { spacing } from '../../theme'
import { ExpressDepositsReview } from '../../components/receive/ExpressDepositsReview'
import { useStackHardwareBack } from '../../hooks/useStackHardwareBack'
import { navigateStackBack } from '../../navigation/stackBackNavigation'

export default function ExpressDepositReviewScreen({ navigation, route }: NavigationProps) {
  const scrollBottomPadding = useScrollBottomPadding(spacing[5])
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
        <ExpressDepositsReview
          navigation={navigation}
          params={params}
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
