import React, { useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { ArrowLeft, ChevronRight, Landmark, Smartphone } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { colors, spacing, textStyles, borderRadius, surfaceFrameStyle } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'
import { useYcReceiveRails } from '../../hooks/useYcFundBalanceFlow'
import type { YcPayInRail } from '../../hooks/useYcCrossBorderFlow'
import { haptics } from '../../lib/haptics'
import { NgLocalVerificationNotice } from '../../components/compliance/NgLocalVerificationNotice'
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

  const navigateToAmount = (rail: YcPayInRail) => {
    haptics.medium()
    navigation.replace('ReceiveLocalAmount' as never, {
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
    const count = (bankAvailable ? 1 : 0) + (momoAvailable ? 1 : 0)
    if (count === 1) {
      navigateToAmount(bankAvailable ? 'bank_transfer' : 'mobile_money')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, rails, bankAvailable, momoAvailable])

  if (ngMissingType) {
    return (
      <ScreenWrapper>
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <Pressable android_ripple={ripple.neutral} style={styles.backRow} onPress={() => navigation.goBack()}>
            <ArrowLeft size={20} color={colors.text.secondary} strokeWidth={2} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Add money</Text>
          <NgLocalVerificationNotice
            missingType={ngMissingType}
            onSaved={() => navigation.goBack()}
          />
        </View>
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottomPadding, paddingTop: insets.top }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable android_ripple={ripple.neutral} style={styles.backRow} onPress={() => navigation.goBack()}>
          <ArrowLeft size={20} color={colors.text.secondary} strokeWidth={2} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Text style={styles.title}>Add money</Text>
        <Text style={styles.subtitle}>Choose how you want to pay in {localPayInCurrency}</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary.main} style={{ marginTop: spacing[6] }} />
        ) : (
          <View style={styles.railList}>
            {bankAvailable ? (
              <Pressable
                android_ripple={ripple.neutral}
                style={[styles.railRow, surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.xl })]}
                onPress={() => navigateToAmount('bank_transfer')}
              >
                <Landmark size={22} color={colors.primary.main} strokeWidth={2} />
                <View style={styles.railInfo}>
                  <Text style={styles.railTitle}>Bank transfer</Text>
                  <Text style={styles.railHint}>Pay from your bank account</Text>
                </View>
                <ChevronRight size={20} color={colors.text.secondary} strokeWidth={2} />
              </Pressable>
            ) : null}
            {momoAvailable ? (
              <Pressable
                android_ripple={ripple.neutral}
                style={[styles.railRow, surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.xl })]}
                onPress={() => navigateToAmount('mobile_money')}
              >
                <Smartphone size={22} color={colors.primary.main} strokeWidth={2} />
                <View style={styles.railInfo}>
                  <Text style={styles.railTitle}>Mobile money</Text>
                  <Text style={styles.railHint}>Pay from your mobile wallet</Text>
                </View>
                <ChevronRight size={20} color={colors.text.secondary} strokeWidth={2} />
              </Pressable>
            ) : null}
            {!bankAvailable && !momoAvailable ? (
              <Text style={styles.unavailable}>
                Local pay-in is not available for your country right now.
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing[5] },
  scroll: { paddingHorizontal: spacing[5] },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], marginBottom: spacing[4] },
  backText: { ...textStyles.body, color: colors.text.secondary },
  title: { ...textStyles.screenTitle, marginBottom: spacing[2] },
  subtitle: { ...textStyles.body, color: colors.text.secondary, marginBottom: spacing[5] },
  railList: { gap: spacing[3] },
  railRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: borderRadius.xl,
  },
  railInfo: { flex: 1 },
  railTitle: { ...textStyles.sectionTitle },
  railHint: { ...textStyles.caption, color: colors.text.secondary, marginTop: spacing[1] },
  unavailable: { ...textStyles.body, color: colors.text.secondary, textAlign: 'center', marginTop: spacing[4] },
})
