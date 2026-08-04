import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import { qk, isVaAnswerSettled, receiveInternationalBankTitle } from '@easner/shared'
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
  Landmark,
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Info,
  Share2,
  ShieldCheck,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import {
  colors,
  shadows,
  surfaceFrameStyle,
  surfaceChromeCircleStyle,
  textStyles,
  borderRadius,
  spacing,
  fontSize,
  fontFamily,
} from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { useToast } from '../../components/ToastProvider'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import { EasnerAlertSheet, PremiumModalSheet } from '../../components/premium'
import { getApiBaseUrl } from '../../lib/apiClient'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useScope } from '../../query/scope'
import { useConsumerVirtualAccounts } from '../../hooks/queries/use-receive-deposit-queries'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import { haptics } from '../../lib/haptics'
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'

type RouteParams = {
  currency?: 'USD' | 'EUR'
}

export default function ReceiveBankDetailsScreen({ navigation, route }: NavigationProps) {
  const scrollBottomPadding = useScrollBottomPadding(spacing[5])
  const { user, userProfile, refreshUserProfile } = useAuth()
  const { showSuccess, showError } = useToast()
  const copyToClipboard = useCopyToClipboard()
  const queryClient = useQueryClient()
  const { scope } = useScope()
  const vaQuery = useConsumerVirtualAccounts()

  const [copiedStates, setCopiedStates] = useState<{ [key: string]: boolean }>({})
  const [accountCreationError, setAccountCreationError] = useState<string | null>(null)
  const [tosTermsSheetMessage, setTosTermsSheetMessage] = useState<string | null>(null)
  const [aboutSheetOpen, setAboutSheetOpen] = useState(false)

  const currency = ((route.params as RouteParams)?.currency || 'USD') as 'USD' | 'EUR'
  const screenTitle = receiveInternationalBankTitle(currency)

  const vaRecord = vaQuery.data?.[currency]
  const virtualAccount = useMemo(() => {
    if (!vaRecord?.hasAccount) return null
    const cl = currency.toLowerCase() as 'usd' | 'eur'
    return {
      hasAccount: true as const,
      currency: cl,
      accountNumber: vaRecord.accountNumber,
      routingNumber: vaRecord.routingNumber,
      iban: vaRecord.iban,
      bic: vaRecord.bic,
      bankName: vaRecord.bankName,
      bankAddress: vaRecord.bankAddress,
      accountHolderName: vaRecord.accountHolderName,
    }
  }, [currency, vaRecord])

  const vaFetched = vaQuery.isFetched

  const getKycStatus = (): string | null => {
    const noahKycStatus = userProfile?.noah_kyc_status || userProfile?.profile?.noah_kyc_status
    if (!noahKycStatus) return null

    switch (noahKycStatus) {
      case 'approved':
        return 'approved'
      case 'rejected':
        return 'rejected'
      case 'under_review':
      case 'in_review':
        return 'in_review'
      case 'not_started':
      case 'incomplete':
      default:
        return null
    }
  }

  const [cachedKycStatus, setCachedKycStatus] = useState<string | null>(null)
  const profileRefreshAtRef = useRef(0)
  const PROFILE_REFRESH_TTL_MS = 5 * 60 * 1000
  const kycStatusStorageKey = useMemo(
    () => (user?.id ? `easner_receive_kyc_status_${user.id}` : null),
    [user?.id],
  )

  const liveKycStatus = getKycStatus()
  const kycStatus = liveKycStatus ?? cachedKycStatus

  const hasAccountData =
    Boolean(virtualAccount?.hasAccount) ||
    Boolean(virtualAccount && (virtualAccount.accountNumber || virtualAccount.iban))

  const vaSettled = isVaAnswerSettled({
    isFetched: vaFetched,
    hasCachedEntry: vaRecord != null,
  })
  const verificationComplete = kycStatus === 'approved'
  const showBankDepositDetails = verificationComplete && hasAccountData

  const accountCreationTriggeredRef = useRef(false)

  useEffect(() => {
    if (!kycStatusStorageKey) return
    let cancelled = false
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(kycStatusStorageKey)
        if (cancelled) return
        if (!raw) return
        const env = JSON.parse(raw) as { status?: string }
        if (env?.status === 'approved' || env?.status === 'in_review' || env?.status === 'rejected') {
          setCachedKycStatus(env.status)
        }
      } catch {
        // ignore
      }
    })()
    return () => {
      cancelled = true
    }
  }, [kycStatusStorageKey])

  useEffect(() => {
    if (!kycStatusStorageKey) return
    if (liveKycStatus !== 'approved' && liveKycStatus !== 'in_review' && liveKycStatus !== 'rejected') return
    setCachedKycStatus(liveKycStatus)
    void AsyncStorage.setItem(kycStatusStorageKey, JSON.stringify({ status: liveKycStatus })).catch(() => {})
  }, [kycStatusStorageKey, liveKycStatus])

  useEffect(() => {
    const autoCreateAccounts = async () => {
      if (kycStatus !== 'approved') {
        accountCreationTriggeredRef.current = false
        return
      }
      if (vaSettled && !hasAccountData) {
        accountCreationTriggeredRef.current = false
        return
      }
      if (hasAccountData) {
        accountCreationTriggeredRef.current = false
        return
      }
      if (accountCreationTriggeredRef.current) return

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) return

        const { data: userProfileData } = await supabase
          .from('users')
          .select('noah_usd_virtual_account_id, noah_eur_virtual_account_id, noah_kyc_status')
          .eq('id', session.user.id)
          .single()

        if (userProfileData) {
          const currencyLower = currency.toLowerCase() as 'usd' | 'eur'
          const accountId =
            currencyLower === 'usd'
              ? userProfileData.noah_usd_virtual_account_id
              : userProfileData.noah_eur_virtual_account_id

          if (!accountId) {
            accountCreationTriggeredRef.current = true
            const syncResponse = await fetch(`${getApiBaseUrl()}/api/noah/create-accounts`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
            })

            if (syncResponse.ok) {
              setTimeout(() => {
                if (scope) {
                  void queryClient.invalidateQueries({ queryKey: qk.wallets.root(scope) })
                }
              }, 3000)
            }
          }
        }
      } catch {
        accountCreationTriggeredRef.current = false
      }
    }

    void autoCreateAccounts()
  }, [kycStatus, currency, hasAccountData, vaSettled, queryClient, scope])

  useFocusEffect(
    React.useCallback(() => {
      const now = Date.now()
      if (now - profileRefreshAtRef.current > PROFILE_REFRESH_TTL_MS) {
        profileRefreshAtRef.current = now
        void refreshUserProfile?.()
      }
    }, [refreshUserProfile]),
  )

  const bankAccountDetails = useMemo(() => {
    if (virtualAccount && (virtualAccount.hasAccount || virtualAccount.accountNumber || virtualAccount.iban)) {
      if (currency === 'USD') {
        return {
          accountName: virtualAccount.accountHolderName,
          accountNumber: virtualAccount.accountNumber,
          routingNumber: virtualAccount.routingNumber,
          iban: undefined,
          swiftBic: undefined,
          bankName: virtualAccount.bankName,
          bankAddress: virtualAccount.bankAddress,
        }
      }
      return {
        accountName: virtualAccount.accountHolderName,
        accountNumber: undefined,
        routingNumber: undefined,
        iban: virtualAccount.iban,
        swiftBic: virtualAccount.bic,
        bankName: virtualAccount.bankName,
        bankAddress: virtualAccount.bankAddress,
      }
    }
    return null
  }, [virtualAccount, currency])

  const aboutSheetTitle = `About your ${currency} Account`
  const aboutSheetIntro = `Please, take note of the following when sending money to your ${currency} account:`
  const aboutPaymentNotes =
    currency === 'USD'
      ? [
          'Only send ACH or Fedwire.',
          'SWIFT is not supported.',
          'Processing time: within a few minutes and up to 48 hours.',
        ]
      : [
          'Only send SEPA and SEPA Instant.',
          'Processing time: within a few minutes and up to 48 hours.',
        ]

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
    if (!bankAccountDetails) return
    try {
      haptics.medium()
      const currencyName = currency === 'USD' ? 'US' : 'EUR'
      let shareText = `Your ${currencyName} Bank Account Details\n\n`

      if (bankAccountDetails.accountName) {
        shareText += `Account Name: ${bankAccountDetails.accountName}\n`
      }

      if (currency === 'USD') {
        if (bankAccountDetails.accountNumber) {
          shareText += `Account Number: ${bankAccountDetails.accountNumber}\n`
        }
        if (bankAccountDetails.routingNumber) {
          shareText += `Routing Number: ${bankAccountDetails.routingNumber}\n`
        }
      } else {
        if (bankAccountDetails.iban) {
          shareText += `IBAN: ${bankAccountDetails.iban}\n`
        }
        if (bankAccountDetails.swiftBic) {
          shareText += `SWIFT/BIC: ${bankAccountDetails.swiftBic}\n`
        }
      }

      if (bankAccountDetails.bankName) {
        shareText += `Bank Name: ${bankAccountDetails.bankName}\n`
      }
      if (bankAccountDetails.bankAddress) {
        shareText += `Bank Address: ${bankAccountDetails.bankAddress}\n`
      }

      await Share.share({
        message: shareText,
        title: `${currencyName} Bank Account Details`,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : ''
      if (message !== 'User did not share') {
        console.error('Error sharing:', error)
      }
    }
  }

  const handleCreateAccounts = async () => {
    try {
      setAccountCreationError(null)
      haptics.medium()

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Not authenticated')
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      let response: Response
      try {
        response = await fetch(`${getApiBaseUrl()}/api/noah/create-accounts`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
      } catch (fetchError: unknown) {
        clearTimeout(timeoutId)
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('Request timed out. Please try again.')
        }
        throw fetchError
      }

      const result = await response.json()

      if (!response.ok) {
        const errorMessage = result.error || result.message || 'Failed to create accounts'
        if (
          errorMessage.toLowerCase().includes('tos') ||
          errorMessage.toLowerCase().includes('terms of service')
        ) {
          throw new Error(
            `${errorMessage}\n\nIf you just accepted TOS, please wait a few seconds and try again. The provider may need a moment to process your acceptance.`,
          )
        }
        throw new Error(errorMessage)
      }

      showSuccess(
        `USD ${result.usdAccountCreated ? 'created' : result.usdAccountId ? 'exists' : 'pending'} · EUR ${result.eurAccountCreated ? 'created' : result.eurAccountId ? 'exists' : 'pending'}`,
        4500,
      )
      if (scope) {
        void queryClient.invalidateQueries({ queryKey: qk.wallets.root(scope) })
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create accounts'
      setAccountCreationError(errorMessage)
      if (
        errorMessage.toLowerCase().includes('tos') ||
        errorMessage.toLowerCase().includes('terms of service')
      ) {
        setTosTermsSheetMessage(errorMessage)
      } else {
        showError(errorMessage)
      }
    }
  }

  const shouldWrapCopyableValue = (value: string, key: string) =>
    key === 'iban' || key === 'bankAddress' || value.length > 28

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
              onPress={() => navigation.goBack()}
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
            {showBankDepositDetails && bankAccountDetails ? (
              <>
                <View style={styles.section}>
                  {bankAccountDetails.accountName &&
                    renderCopyableField('Account Name', bankAccountDetails.accountName, 'accountName')}

                  {currency === 'USD' ? (
                    <>
                      {bankAccountDetails.accountNumber &&
                        renderCopyableField(
                          'Account Number',
                          bankAccountDetails.accountNumber,
                          'accountNumber',
                        )}
                      {bankAccountDetails.routingNumber &&
                        renderCopyableField(
                          'Routing Number',
                          bankAccountDetails.routingNumber,
                          'routingNumber',
                        )}
                    </>
                  ) : (
                    <>
                      {bankAccountDetails.iban &&
                        renderCopyableField('IBAN', bankAccountDetails.iban, 'iban')}
                      {bankAccountDetails.swiftBic &&
                        renderCopyableField('SWIFT/BIC', bankAccountDetails.swiftBic, 'swiftBic')}
                    </>
                  )}

                  {bankAccountDetails.bankName &&
                    renderCopyableField('Bank Name', bankAccountDetails.bankName, 'bankName')}
                  {bankAccountDetails.bankAddress &&
                    renderCopyableField('Bank Address', bankAccountDetails.bankAddress, 'bankAddress')}
                </View>

                <View style={styles.detailActionsRow}>
                  <Pressable
                    android_ripple={ripple.neutral}
                    style={styles.detailActionButton}
                    onPress={handleShare}
                    accessibilityRole="button"
                    accessibilityLabel="Share account detail"
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
                    accessibilityLabel="About account"
                  >
                    <Info size={20} color={colors.primary.main} strokeWidth={2} />
                    <Text style={styles.detailActionText}>About Account</Text>
                  </Pressable>
                </View>
              </>
            ) : !verificationComplete || vaFetched ? (
              <View style={styles.kycNoticeContainer}>
                <View style={styles.kycNoticeIconContainer}>
                  <ShieldCheck size={32} color={colors.primary.main} strokeWidth={2} />
                </View>
                <Text style={styles.kycNoticeTitle}>
                  {kycStatus === 'approved'
                    ? 'Account Setup in Progress'
                    : kycStatus === 'in_review'
                      ? 'Verification in Review'
                      : 'Complete Verification to get an account'}
                </Text>
                <Text style={styles.kycNoticeText}>
                  {kycStatus === 'in_review'
                    ? 'Your verification is currently being reviewed.'
                    : !kycStatus
                      ? 'Please complete your identity verification to receive bank deposit information.'
                      : kycStatus === 'rejected'
                        ? 'Your verification could not be completed. Please complete identity verification again to receive your account details.'
                        : kycStatus === 'approved'
                          ? 'Your account is being set up. This may take a few moments. Please check back shortly.'
                          : 'Please complete your identity verification to receive bank deposit information.'}
                </Text>
                {kycStatus !== 'approved' && kycStatus !== 'in_review' ? (
                  <Pressable
                    android_ripple={ripple.neutral}
                    style={styles.kycNoticeButton}
                    onPress={() => {
                      haptics.medium()
                      navigation.navigate('AccountVerification' as never)
                    }}
                  >
                    <Text style={styles.kycNoticeButtonText}>Complete Verification</Text>
                    <ArrowRight size={18} color={colors.text.inverse} strokeWidth={2} />
                  </Pressable>
                ) : null}
                {accountCreationError ? (
                  <Text style={styles.errorText}>{accountCreationError}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>

      <PremiumModalSheet visible={aboutSheetOpen} onRequestClose={() => setAboutSheetOpen(false)}>
        <View style={styles.aboutSheetContent}>
          <View style={styles.aboutSheetHeader}>
            <View style={styles.aboutSheetIcon}>
              <Landmark size={22} color={colors.primary.main} strokeWidth={2} />
            </View>
            <Text style={styles.aboutSheetTitle}>{aboutSheetTitle}</Text>
          </View>
          <Text style={styles.aboutSheetIntro}>{aboutSheetIntro}</Text>

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

      <EasnerAlertSheet
        visible={tosTermsSheetMessage !== null}
        onDismiss={() => setTosTermsSheetMessage(null)}
        title="Terms of Service Required"
        message={tosTermsSheetMessage ?? ''}
        primaryLabel="Go to Verification"
        onPrimary={() => {
          setTosTermsSheetMessage(null)
          navigation.navigate('AccountVerification' as never)
        }}
        secondaryLabel="Retry in 5s"
        onSecondary={() => {
          setTosTermsSheetMessage(null)
          setTimeout(() => handleCreateAccounts(), 5000)
        }}
      />
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
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    minWidth: 0,
  },
  section: {
    marginBottom: spacing[5],
    minWidth: 0,
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
    paddingVertical: spacing[3],
    borderWidth: 1,
    borderColor: colors.primary.main + '30',
  },
  detailActionText: {
    ...textStyles.bodySmall,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
    textAlign: 'center',
  },
  kycNoticeContainer: {
    backgroundColor: colors.background.primary,
    borderRadius: borderRadius.xl,
    padding: spacing[5],
    marginBottom: spacing[5],
    borderWidth: 1.5,
    borderColor: colors.primary.main + '30',
    alignItems: 'center',
    ...shadows.sm,
  },
  kycNoticeIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary.main + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  kycNoticeTitle: {
    ...textStyles.titleLarge,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    textAlign: 'center',
    marginBottom: spacing[2],
  },
  kycNoticeText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing[4],
  },
  kycNoticeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary.main,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    gap: spacing[2],
    alignSelf: 'center',
    marginTop: spacing[2],
  },
  kycNoticeButtonText: {
    ...textStyles.bodyMedium,
    color: colors.text.inverse,
    fontWeight: '600',
    fontSize: fontSize.sm,
  },
  errorText: {
    ...textStyles.bodySmall,
    color: colors.error.main,
    fontFamily: fontFamily.regular,
    marginTop: spacing[2],
    textAlign: 'center',
  },
  aboutSheetContent: {
    gap: spacing[3],
  },
  aboutSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  aboutSheetIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary.main + '10',
    borderWidth: 0.5,
    borderColor: colors.primary.main + '30',
  },
  aboutSheetTitle: {
    flex: 1,
    ...textStyles.titleMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  aboutSheetIntro: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    lineHeight: 22,
  },
  aboutSheetScroll: {
    maxHeight: 420,
  },
  aboutSheetScrollContent: {
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[6],
  },
  aboutNoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    marginTop: spacing[1],
  },
  aboutNoteDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary.main,
    marginTop: 8,
  },
  aboutNoteText: {
    flex: 1,
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    lineHeight: 22,
  },
})
