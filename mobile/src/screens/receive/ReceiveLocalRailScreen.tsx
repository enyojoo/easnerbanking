import React, { useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { ArrowLeft, Landmark, Smartphone } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { colors, spacing, textStyles, surfaceChromeCircleStyle } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'
import { useYcReceiveRails } from '../../hooks/useYcFundBalanceFlow'
import type { YcPayInRail } from '../../hooks/useYcCrossBorderFlow'
import { haptics } from '../../lib/haptics'
import { NgLocalVerificationNotice } from '../../components/compliance/NgLocalVerificationNotice'
import { ReceiveLocalRailCard } from '../../components/receive/ReceiveLocalRailCard'
import type { NgLocalIdType } from '@easner/shared'

type RouteParams = {
  localPayInCurrency: string
  residenceCountry: string
  ngMissingType?: NgLocalIdType | null
}

export default function ReceiveLocalRailScreen({ navigation, route }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const scrollBottomPadding = useScrollBottomPadding(spacing[5])
  const params = (route.params || {}) as Partial<RouteParams>
  const localPayInCurrency = params.localPayInCurrency ?? ''
  const residenceCountry = params.residenceCountry ?? ''
  const ngMissingType = params.ngMissingType ?? null

  const { rails, loading } = useYcReceiveRails({
    country: residenceCountry,
    currency: localPayInCurrency,
    enabled: Boolean(residenceCountry && localPayInCurrency),
  })

  const bankAvailable = rails?.rails.bank_transfer.available ?? false
  const momoAvailable = rails?.rails.mobile_money.available ?? false
  const railCount = (bankAvailable ? 1 : 0) + (momoAvailable ? 1 : 0)

  const navigateToAmount = (rail: YcPayInRail) => {
    haptics.medium()
    navigation.navigate('ReceiveLocalAmount' as never, {
      localPayInCurrency,
      residenceCountry,
      payInRail: rail,
      bankAvailable,
      momoAvailable,
      ngMissingType,
    } as never)
  }

  useEffect(() => {
    if (loading || !rails) return
    if (railCount === 1) {
      navigateToAmount(bankAvailable ? 'bank_transfer' : 'mobile_money')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, rails, bankAvailable, momoAvailable, railCount])

  if (ngMissingType) {
    return (
      <ScreenWrapper>
        <View style={[styles.blocked, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <Pressable android_ripple={ripple.neutral} onPress={() => navigation.goBack()} style={styles.backButton}>
              <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
            </Pressable>
            <Text style={styles.title}>Add money</Text>
          </View>
          <NgLocalVerificationNotice missingType={ngMissingType} onSaved={() => navigation.goBack()} />
        </View>
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper>
      <View style={[styles.main, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable android_ripple={ripple.neutral} onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.title}>Add money</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottomPadding }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.subtitle}>Choose how you want to pay in {localPayInCurrency}</Text>

          {loading ? (
            <ActivityIndicator color={colors.primary.main} style={{ marginTop: spacing[8] }} />
          ) : (
            <View style={[styles.cardRow, railCount === 1 && styles.cardRowSingle]}>
              {bankAvailable ? (
                <ReceiveLocalRailCard
                  fullWidth={railCount === 1}
                  title="Bank transfer"
                  subtitle="Pay from your bank"
                  icon={<Landmark size={26} color={colors.primary.main} strokeWidth={2} />}
                  onPress={() => navigateToAmount('bank_transfer')}
                />
              ) : null}
              {momoAvailable ? (
                <ReceiveLocalRailCard
                  fullWidth={railCount === 1}
                  title="Mobile money"
                  subtitle="Pay from your wallet"
                  icon={<Smartphone size={26} color={colors.primary.main} strokeWidth={2} />}
                  onPress={() => navigateToAmount('mobile_money')}
                />
              ) : null}
            </View>
          )}

          {!loading && !bankAvailable && !momoAvailable ? (
            <Text style={styles.unavailable}>
              Local pay-in is not available for your country right now.
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  main: { flex: 1 },
  blocked: { flex: 1, paddingHorizontal: spacing[5] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
  backButton: {
    ...surfaceChromeCircleStyle(colors, 44),
    marginRight: spacing[3],
  },
  headerContent: { flex: 1, justifyContent: 'center' },
  title: { ...textStyles.headlineMedium, color: colors.text.primary },
  scroll: { paddingHorizontal: spacing[5], paddingTop: spacing[2] },
  subtitle: {
    ...textStyles.body,
    color: colors.text.secondary,
    marginBottom: spacing[5],
    textAlign: 'center',
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing[3],
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  cardRowSingle: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  unavailable: {
    ...textStyles.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing[6],
  },
})
