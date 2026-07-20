import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { ArrowLeft } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { REVIEW_ROW_LABELS, normalizeYcMomoPhone } from '@easner/shared'
import { colors, textStyles, borderRadius, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'
import { YcMomoPhoneInput } from '../YcMomoPhoneInput'
import {
  ensureFundBalanceOrderConfirmed,
  ensurePayInNetworksCached,
  peekLastFundBalanceQuoteError,
  readCachedPayInNetworks,
} from '../../lib/sendFlowFundBalanceQuote'
import { useAuth } from '../../contexts/AuthContext'

type PayInNetwork = { id: string; name: string }

type Props = {
  navigation: { goBack: () => void; navigate: (name: string, params?: object) => void }
  localPayInCurrency: string
  residenceCountry: string
  amountEntryMode: 'usd' | 'local'
  enteredAmount: number
  usdCredit: number
  localPayIn: number
  customerRate: number
  footerPadding: number
  listBottomPadding: number
}

export function YcFundBalanceMomoSetup({
  navigation,
  localPayInCurrency,
  residenceCountry,
  amountEntryMode,
  enteredAmount,
  usdCredit,
  localPayIn,
  customerRate,
  footerPadding,
  listBottomPadding,
}: Props) {
  const { userProfile } = useAuth()
  const defaultPhone = userProfile?.phone ?? userProfile?.profile?.phone ?? ''
  const cachedNetworks = readCachedPayInNetworks(residenceCountry, localPayInCurrency)

  const [phone, setPhone] = useState(() =>
    defaultPhone ? normalizeYcMomoPhone(defaultPhone, residenceCountry) : '',
  )
  const [networks, setNetworks] = useState<PayInNetwork[]>(() => cachedNetworks ?? [])
  const [networkId, setNetworkId] = useState(() =>
    cachedNetworks?.length === 1 ? cachedNetworks[0].id : '',
  )
  const [networksLoading, setNetworksLoading] = useState(!cachedNetworks?.length)
  const [networksError, setNetworksError] = useState<string | null>(null)
  const [isContinueLoading, setIsContinueLoading] = useState(false)
  const [continueError, setContinueError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const hadCache = Boolean(cachedNetworks?.length)
    if (!hadCache) setNetworksLoading(true)
    setNetworksError(null)
    void (async () => {
      try {
        const rows = await ensurePayInNetworksCached(residenceCountry, localPayInCurrency)
        if (cancelled) return
        setNetworks(rows)
        if (rows.length === 1) setNetworkId(rows[0].id)
      } catch (e) {
        if (!cancelled) {
          setNetworksError(e instanceof Error ? e.message : 'Could not load networks')
        }
      } finally {
        if (!cancelled) setNetworksLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [residenceCountry, localPayInCurrency, cachedNetworks?.length])

  const momoReady = Boolean(phone.trim() && networkId)
  const selectedNetwork = networks.find((n) => n.id === networkId)

  const onContinue = async () => {
    if (!momoReady || isContinueLoading) return
    setContinueError(null)
    haptics.medium()
    setIsContinueLoading(true)
    try {
      const quoteMeta = {
        country: residenceCountry,
        currency: localPayInCurrency,
        rail: 'mobile_money' as const,
        amountEntryMode,
        enteredAmount,
        sourcePhone: phone.trim(),
        networkId,
        sourceNetworkName: selectedNetwork?.name,
      }
      const quote = await ensureFundBalanceOrderConfirmed(quoteMeta)
      if (!quote?.transferId) {
        setContinueError(peekLastFundBalanceQuoteError() ?? 'Could not lock deposit details')
        return
      }
      navigation.navigate('ReceiveLocalReview' as never, {
        localPayInCurrency,
        residenceCountry,
        payInRail: 'mobile_money',
        amountEntryMode,
        enteredAmount,
        usdCredit: quote.usdCredit ?? usdCredit,
        localPayIn: quote.localPayIn ?? localPayIn,
        customerRate: quote.customerRate ?? customerRate,
        sourcePhone: phone.trim(),
        networkId,
        sourceNetworkName: selectedNetwork?.name,
      } as never)
    } finally {
      setIsContinueLoading(false)
    }
  }

  return (
    <View style={[styles.container, { paddingBottom: footerPadding }]}>
      <View style={styles.header}>
        <Pressable android_ripple={ripple.neutral} onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
        </Pressable>
        <Text style={styles.title}>Mobile money</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: listBottomPadding }} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{REVIEW_ROW_LABELS.momoNumberPrompt}</Text>
          <YcMomoPhoneInput
            countryCode={residenceCountry}
            value={phone}
            onChange={setPhone}
            placeholder="712345678"
          />
          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
            {REVIEW_ROW_LABELS.momoNetworkPrompt}
          </Text>
          {networksLoading ? (
            <ActivityIndicator color={colors.primary.main} style={{ marginVertical: spacing[3] }} />
          ) : networksError ? (
            <Text style={styles.error}>{networksError}</Text>
          ) : (
            <View style={styles.networkList}>
              {networks.map((network) => {
                const selected = network.id === networkId
                return (
                  <Pressable
                    key={network.id}
                    android_ripple={ripple.neutral}
                    style={[styles.networkOption, selected && styles.networkOptionSelected]}
                    onPress={() => {
                      haptics.tap()
                      setNetworkId(network.id)
                    }}
                  >
                    <Text
                      style={[
                        styles.networkOptionText,
                        selected && styles.networkOptionTextSelected,
                      ]}
                    >
                      {network.name}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {continueError ? <Text style={styles.error}>{continueError}</Text> : null}

      <Pressable
        android_ripple={ripple.neutral}
        style={[styles.cta, (!momoReady || isContinueLoading) && styles.ctaDisabled]}
        onPress={() => void onContinue()}
        disabled={!momoReady || isContinueLoading}
      >
        <LinearGradient
          colors={!momoReady || isContinueLoading ? [colors.neutral[400], colors.neutral[400]] : colors.primary.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.ctaGradient}
        >
          {isContinueLoading ? (
            <ActivityIndicator color={colors.text.inverse} />
          ) : (
            <Text style={styles.ctaText}>Continue</Text>
          )}
        </LinearGradient>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing[5] },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[4] },
  backButton: { padding: spacing[1] },
  title: { ...textStyles.screenTitle },
  card: {
    backgroundColor: colors.semantic.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
  },
  fieldLabel: { ...textStyles.caption, color: colors.text.secondary, marginBottom: spacing[2] },
  fieldLabelSpaced: { marginTop: spacing[4] },
  networkList: { gap: spacing[2] },
  networkOption: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.light,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
  },
  networkOptionSelected: {
    borderColor: colors.primary.main,
    backgroundColor: colors.primary.main + '12',
  },
  networkOptionText: { ...textStyles.body, color: colors.text.primary },
  networkOptionTextSelected: { fontFamily: textStyles.sectionTitle.fontFamily },
  error: { ...textStyles.caption, color: colors.semantic.destructive, marginTop: spacing[2] },
  cta: { borderRadius: borderRadius.lg, overflow: 'hidden', marginTop: spacing[3] },
  ctaDisabled: { opacity: 0.7 },
  ctaGradient: { paddingVertical: spacing[4], alignItems: 'center' },
  ctaText: { ...textStyles.button, color: colors.text.inverse },
})
