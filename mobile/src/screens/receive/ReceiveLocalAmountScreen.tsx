import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { ArrowLeft, ArrowUpDown, ChevronRight } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatMoneyDisplay } from '@easner/shared'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { colors, spacing, textStyles, borderRadius, surfaceFrameStyle, fontFamily } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { useFixedFooterPadding } from '../../hooks/useScrollBottomPadding'
import { useYcFundBalanceFlow } from '../../hooks/useYcFundBalanceFlow'
import type { YcPayInRail } from '../../hooks/useYcCrossBorderFlow'
import { haptics } from '../../lib/haptics'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import { AmountKeypad } from '../../components/receive/AmountKeypad'
import { useBalance } from '../../contexts/BalanceContext'
import { getCurrencySymbol } from '../../utils/formatters'
import type { NgLocalIdType } from '@easner/shared'
import { NgLocalVerificationNotice } from '../../components/compliance/NgLocalVerificationNotice'

type RouteParams = {
  localPayInCurrency: string
  residenceCountry: string
  payInRail: YcPayInRail
  bankAvailable?: boolean
  momoAvailable?: boolean
  ngMissingType?: NgLocalIdType | null
}

export default function ReceiveLocalAmountScreen({ navigation, route }: NavigationProps) {
  const insets = useSafeAreaInsets()
  const footerPadding = useFixedFooterPadding(spacing[5])
  const { width } = useWindowDimensions()
  const { balances } = useBalance()
  const params = (route.params || {}) as Partial<RouteParams>

  const localPayInCurrency = params.localPayInCurrency ?? ''
  const residenceCountry = params.residenceCountry ?? ''
  const payInRail = params.payInRail ?? 'bank_transfer'
  const bankAvailable = params.bankAvailable ?? false
  const momoAvailable = params.momoAvailable ?? false
  const ngMissingType = params.ngMissingType ?? null

  const [amountEntryMode, setAmountEntryMode] = useState<'usd' | 'local'>('usd')
  const [amountStr, setAmountStr] = useState('0')

  const enteredAmount = useMemo(
    () => Number.parseFloat(amountStr.replace(/,/g, '')) || 0,
    [amountStr],
  )

  const ycFlow = useYcFundBalanceFlow({
    country: residenceCountry,
    currency: localPayInCurrency,
    rail: payInRail,
    enabled: Boolean(residenceCountry && localPayInCurrency),
    amountEntryMode,
    enteredAmount,
  })

  const usdBalance = parseFloat(balances.USD || '0')
  const railLabel = payInRail === 'mobile_money' ? 'Mobile money' : 'Bank transfer'
  const amountPositive = enteredAmount > 0
  const canContinue = amountPositive && !ycFlow.ratesLoading

  const amountSymbol =
    amountEntryMode === 'usd' ? getCurrencySymbol('USD') : getCurrencySymbol(localPayInCurrency)

  const toggleAmountDirection = () => {
    haptics.tap()
    if (amountEntryMode === 'usd' && ycFlow.preview.localPayIn > 0) {
      setAmountEntryMode('local')
      setAmountStr(
        ycFlow.preview.localPayIn.toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        }),
      )
    } else if (amountEntryMode === 'local' && ycFlow.preview.usdCredit > 0) {
      setAmountEntryMode('usd')
      setAmountStr(
        ycFlow.preview.usdCredit.toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        }),
      )
    } else {
      setAmountEntryMode(amountEntryMode === 'usd' ? 'local' : 'usd')
    }
  }

  const changeRail = () => {
    if (!bankAvailable || !momoAvailable) return
    haptics.tap()
    navigation.replace('ReceiveLocalRail' as never, {
      localPayInCurrency,
      residenceCountry,
      ngMissingType,
    } as never)
  }

  const onContinue = () => {
    if (!canContinue) return
    haptics.medium()
    navigation.navigate('ReceiveLocalReview' as never, {
      localPayInCurrency,
      residenceCountry,
      payInRail,
      amountEntryMode,
      enteredAmount,
      usdCredit: ycFlow.preview.usdCredit,
      localPayIn: ycFlow.preview.localPayIn,
    } as never)
  }

  if (ngMissingType) {
    return (
      <ScreenWrapper>
        <View style={[styles.blocked, { paddingTop: insets.top }]}>
          <Pressable android_ripple={ripple.neutral} style={styles.backRow} onPress={() => navigation.goBack()}>
            <ArrowLeft size={20} color={colors.text.secondary} strokeWidth={2} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <NgLocalVerificationNotice missingType={ngMissingType} onSaved={() => navigation.goBack()} />
        </View>
      </ScreenWrapper>
    )
  }

  const headlineSize = width < 360 ? 40 : 48

  return (
    <ScreenWrapper>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable android_ripple={ripple.neutral} style={styles.backRow} onPress={() => navigation.goBack()}>
            <ArrowLeft size={20} color={colors.text.secondary} strokeWidth={2} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Add money</Text>
        </View>

        <View style={[styles.creditBar, surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.xl })]}>
          <Text style={styles.creditLabel}>Credit to:</Text>
          <View style={styles.creditRow}>
            <CurrencyFlag currency="USD" size={22} />
            <Text style={styles.creditText}>
              USD Balance • ${usdBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
        </View>

        <View style={styles.amountSection}>
          <Text style={styles.amountLabel}>
            {amountEntryMode === 'usd' ? 'Amount (USD)' : `Amount (${localPayInCurrency})`}
          </Text>
          <Text style={[styles.amountDisplay, { fontSize: headlineSize }]}>
            {amountSymbol}
            {amountStr}
          </Text>
          {amountPositive ? (
            <Pressable android_ripple={ripple.neutral} style={styles.rateRow} onPress={toggleAmountDirection}>
              <ArrowUpDown size={13} color={colors.primary.main} strokeWidth={2.5} />
              <Text style={styles.rateText}>
                {amountEntryMode === 'usd'
                  ? `Pay ≈ ${formatMoneyDisplay(ycFlow.preview.localPayIn, localPayInCurrency)}`
                  : `Receive ≈ ${formatMoneyDisplay(ycFlow.preview.usdCredit, 'USD')}`}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.ratePlaceholder}> </Text>
          )}
        </View>

        <Pressable
          android_ripple={ripple.neutral}
          style={[styles.sourcePill, surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.full })]}
          onPress={changeRail}
          disabled={!bankAvailable || !momoAvailable}
        >
          <CurrencyFlag currency={localPayInCurrency} size={20} />
          <Text style={styles.sourceText}>
            {localPayInCurrency} • {railLabel}
          </Text>
          {bankAvailable && momoAvailable ? (
            <ChevronRight size={18} color={colors.text.secondary} strokeWidth={2} />
          ) : null}
        </Pressable>

        <View style={styles.keypadWrap}>
          <AmountKeypad value={amountStr} onChange={setAmountStr} />
        </View>

        <View style={[styles.footer, { paddingBottom: footerPadding }]}>
          <Pressable
            android_ripple={ripple.neutral}
            style={[styles.cta, !canContinue && styles.ctaDisabled]}
            onPress={onContinue}
            disabled={!canContinue}
          >
            <LinearGradient
              colors={!canContinue ? [colors.neutral[400], colors.neutral[400]] : colors.primary.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGradient}
            >
              <Text style={styles.ctaText}>Continue</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  blocked: { flex: 1, paddingHorizontal: spacing[5] },
  header: { paddingHorizontal: spacing[5] },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], marginBottom: spacing[2] },
  backText: { ...textStyles.body, color: colors.text.secondary },
  title: { ...textStyles.screenTitle, marginBottom: spacing[3] },
  creditBar: {
    marginHorizontal: spacing[5],
    padding: spacing[4],
    borderRadius: borderRadius.xl,
    marginBottom: spacing[4],
  },
  creditLabel: { ...textStyles.caption, color: colors.text.secondary, marginBottom: spacing[1] },
  creditRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  creditText: { ...textStyles.body, fontFamily: fontFamily.semibold },
  amountSection: { alignItems: 'center', paddingHorizontal: spacing[5], marginBottom: spacing[3] },
  amountLabel: { ...textStyles.caption, color: colors.text.secondary, marginBottom: spacing[2] },
  amountDisplay: {
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  rateText: { ...textStyles.caption, color: colors.text.secondary },
  ratePlaceholder: { ...textStyles.caption, opacity: 0 },
  sourcePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginHorizontal: spacing[5],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.full,
    alignSelf: 'center',
    marginBottom: spacing[4],
  },
  sourceText: { ...textStyles.body, flex: 1 },
  keypadWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing[5] },
  footer: { paddingHorizontal: spacing[5], paddingTop: spacing[2] },
  cta: { borderRadius: borderRadius.lg, overflow: 'hidden' },
  ctaDisabled: { opacity: 0.7 },
  ctaGradient: { paddingVertical: spacing[4], alignItems: 'center' },
  ctaText: { ...textStyles.button, color: colors.text.inverse },
})
