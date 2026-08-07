import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Share,
} from 'react-native'
import {
  ArrowLeft,
  Check,
  Copy,
  Info,
  Share2,
  Wallet,
} from 'lucide-react-native'
import QRCode from 'react-native-qrcode-svg'
import { formatStablecoinDepositSchemeLabel } from '@easner/shared'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import {
  colors,
  surfaceFrameStyle,
  surfaceChromeCircleStyle,
  textStyles,
  borderRadius,
  spacing,
  fontFamily,
} from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import { PremiumModalSheet } from '../../components/premium'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import { haptics } from '../../lib/haptics'
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'
import { useStackHardwareBack } from '../../hooks/useStackHardwareBack'
import { navigateStackBack } from '../../navigation/stackBackNavigation'

type RouteParams = {
  currency?: 'USD' | 'EUR'
  asset?: string
  network?: string
  address?: string
  memo?: string
  estimatedFeeBps?: number | null
}

export default function ReceiveStablecoinDetailsScreen({ navigation, route }: NavigationProps) {
  const scrollBottomPadding = useScrollBottomPadding(spacing[5])
  const copyToClipboard = useCopyToClipboard()
  const [copiedStates, setCopiedStates] = useState<{ [key: string]: boolean }>({})
  const [aboutSheetOpen, setAboutSheetOpen] = useState(false)

  const params = (route.params || {}) as RouteParams
  const currency = (params.currency || 'USD') as 'USD' | 'EUR'
  const asset = String(params.asset || (currency === 'EUR' ? 'EURC' : 'USDC')).toUpperCase()
  const network = String(params.network || 'Solana')
  const address = String(params.address || '').trim()
  const memo = String(params.memo || '').trim() || undefined
  const estimatedFeeBps =
    params.estimatedFeeBps != null && Number.isFinite(Number(params.estimatedFeeBps))
      ? Number(params.estimatedFeeBps)
      : null

  const screenTitle = formatStablecoinDepositSchemeLabel({ asset, chain: network })

  const handleBack = () => navigateStackBack(navigation)
  useStackHardwareBack(handleBack)

  const aboutPaymentNotes = useMemo(() => {
    if (network === 'Tron') {
      return [
        'Only send USDT on Tron (TRC-20) to this address.',
        'Bridge fees apply and are deducted from your credited balance.',
        'Sending other assets or networks may result in permanent loss.',
      ]
    }
    return [
      `Only send ${asset} on Solana to this address.`,
      'Sending other assets or networks may result in permanent loss.',
      'Processing time: within seconds.',
    ]
  }, [asset, network])

  const handleCopy = async (text: string, key: string) => {
    const ok = await copyToClipboard(text)
    if (!ok) return
    haptics.success()
    setCopiedStates((prev) => ({ ...prev, [key]: true }))
    setTimeout(() => {
      setCopiedStates((prev) => ({ ...prev, [key]: false }))
    }, 2000)
  }

  const handleShare = async () => {
    try {
      haptics.medium()
      if (!address) return
      const networkTicker = network === 'Solana' ? 'SOL' : network.toUpperCase()
      let shareText = `Your Stablecoin ${asset} Details\n\n`
      shareText += `Network: ${networkTicker} • ${network}\n`
      shareText += `Address: ${address}\n`
      if (memo) shareText += `Memo (Required): ${memo}\n`
      await Share.share({
        message: shareText,
        title: `${asset} Details`,
      })
    } catch (error: any) {
      if (error?.message !== 'User did not share') {
        console.error('Error sharing:', error)
      }
    }
  }

  const shouldWrapCopyableValue = (value: string, key: string) =>
    key === 'stablecoinAddress' || value.length > 28

  const renderCopyableField = (label: string, value: string, key: string) => {
    const wrapValue = shouldWrapCopyableValue(value, key)
    return (
      <View style={styles.fieldContainer}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Pressable
          android_ripple={ripple.neutral}
          style={[styles.fieldValueContainer, wrapValue && styles.fieldValueContainerWrap]}
          onPress={() => handleCopy(value, key)}
        >
          <Text
            style={[styles.fieldValue, wrapValue && styles.fieldValueWrap]}
            {...(wrapValue ? {} : { numberOfLines: 1 })}
          >
            {value}
          </Text>
          <View style={styles.copyButton}>
            {copiedStates[key] ? (
              <Check size={18} color={colors.primary.main} strokeWidth={2.5} />
            ) : (
              <Copy size={18} color={colors.text.secondary} strokeWidth={2} />
            )}
          </View>
        </Pressable>
      </View>
    )
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <Pressable
              android_ripple={ripple.neutral}
              onPress={handleBack}
              style={styles.backButton}
            >
              <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
            </Pressable>
            <View style={styles.headerContent}>
              <Text style={styles.title}>{screenTitle}</Text>
              <View style={styles.currencyDisplay}>
                <CurrencyFlag currency={currency} size={24} style={styles.currencyFlag} />
                <Text style={styles.currencyText}>{currency}</Text>
              </View>
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
        >
          <View style={styles.content}>
            {address ? (
              <>
                <View style={styles.section}>
                  <View style={styles.qrSection}>
                    <View style={styles.qrContainer}>
                      <QRCode
                        value={address}
                        size={200}
                        color={colors.text.primary}
                        backgroundColor={colors.background.primary}
                      />
                    </View>
                    <Text style={styles.qrHint}>
                      Scan to send {asset} on {network}
                    </Text>
                  </View>

                  <View style={styles.fieldContainer}>
                    <Text style={styles.fieldLabel}>Network</Text>
                    <View style={styles.fieldValueContainer}>
                      <Text style={styles.fieldValue}>{network}</Text>
                    </View>
                  </View>

                  {renderCopyableField(`${asset} Address`, address, 'stablecoinAddress')}

                  {memo ? renderCopyableField('Memo (Required)', memo, 'memo') : null}

                  {estimatedFeeBps != null ? (
                    <Text style={styles.feeDisclaimer}>
                      Estimated bridge fee: ~{(estimatedFeeBps / 100).toFixed(2)}%
                      {'\n'}Final fee is calculated when your deposit settles.
                    </Text>
                  ) : null}
                </View>

                <View style={styles.detailActionsRow}>
                  <Pressable
                    android_ripple={ripple.neutral}
                    style={styles.detailActionButton}
                    onPress={handleShare}
                    accessibilityRole="button"
                    accessibilityLabel="Share address detail"
                  >
                    <Share2 size={20} color={colors.primary.main} strokeWidth={2} />
                    <Text style={styles.detailActionText}>Share Detail</Text>
                  </Pressable>

                  <Pressable
                    android_ripple={ripple.neutral}
                    style={styles.detailActionButton}
                    onPress={() => {
                      haptics.tap()
                      setAboutSheetOpen(true)
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="About address"
                  >
                    <Info size={20} color={colors.primary.main} strokeWidth={2} />
                    <Text style={styles.detailActionText}>About Address</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Text style={styles.missing}>Deposit address is not available yet.</Text>
            )}
          </View>
        </ScrollView>
      </View>

      <PremiumModalSheet
        visible={aboutSheetOpen}
        onRequestClose={() => setAboutSheetOpen(false)}
      >
        <View style={styles.aboutSheetContent}>
          <View style={styles.aboutSheetHeader}>
            <View style={styles.aboutSheetIcon}>
              <Wallet size={22} color={colors.primary.main} strokeWidth={2} />
            </View>
            <Text style={styles.aboutSheetTitle}>About your {asset} Address</Text>
          </View>
          <Text style={styles.aboutSheetIntro}>
            Please, take note of the following when sending {asset} to your address:
          </Text>
          <ScrollView
            style={styles.aboutSheetScroll}
            contentContainerStyle={styles.aboutSheetScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {aboutPaymentNotes.map((note) => (
              <View key={note} style={styles.aboutNoteRow}>
                <View style={styles.aboutNoteDot} />
                <Text style={styles.aboutNoteText}>{note}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </PremiumModalSheet>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    ...surfaceChromeCircleStyle(colors, 44),
    marginRight: spacing[3],
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
    marginBottom: 2,
    flexShrink: 1,
    paddingRight: spacing[2],
  },
  currencyDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  currencyFlag: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  currencyText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  scrollView: { flex: 1 },
  content: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    minWidth: 0,
  },
  section: {
    marginBottom: spacing[5],
    minWidth: 0,
  },
  qrSection: {
    alignItems: 'center',
    marginBottom: spacing[5],
  },
  qrContainer: {
    width: 240,
    height: 240,
    padding: spacing[3],
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.xl }),
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrHint: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginTop: spacing[3],
    textAlign: 'center',
  },
  fieldContainer: {
    marginBottom: spacing[3],
    minWidth: 0,
  },
  fieldLabel: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
    marginBottom: spacing[1],
  },
  fieldValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.full }),
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  fieldValueContainerWrap: {
    alignItems: 'flex-start',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.xl,
  },
  fieldValue: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
    fontVariant: ['tabular-nums'],
  },
  fieldValueWrap: {
    fontFamily: fontFamily.regular,
    lineHeight: 22,
    ...Platform.select({
      web: {
        wordBreak: 'break-all',
        overflowWrap: 'anywhere',
      },
      default: {},
    }),
  },
  copyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing[2],
    flexShrink: 0,
  },
  feeDisclaimer: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginTop: spacing[1],
    lineHeight: 18,
  },
  detailActionsRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[2],
    marginBottom: spacing[4],
  },
  detailActionButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    backgroundColor: colors.primary.main + '10',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[3],
  },
  detailActionText: {
    ...textStyles.bodyMedium,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
  },
  missing: {
    ...textStyles.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing[6],
  },
  aboutSheetContent: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[6],
  },
  aboutSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginBottom: spacing[3],
  },
  aboutSheetIcon: {
    ...surfaceChromeCircleStyle(colors, 40),
  },
  aboutSheetTitle: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    flex: 1,
  },
  aboutSheetIntro: {
    ...textStyles.body,
    color: colors.text.secondary,
    marginBottom: spacing[4],
  },
  aboutSheetScroll: {
    maxHeight: 280,
  },
  aboutSheetScrollContent: {
    gap: spacing[3],
    paddingBottom: spacing[2],
  },
  aboutNoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  aboutNoteDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary.main,
    marginTop: 7,
  },
  aboutNoteText: {
    ...textStyles.body,
    color: colors.text.primary,
    flex: 1,
  },
})
