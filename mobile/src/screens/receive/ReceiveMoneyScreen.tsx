import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import { qk, isVaAnswerSettled, shouldShowBankDepositTab, mapResidenceToLocalPayInCurrency, type NgLocalIdType } from '@easner/shared'
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
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Info,
  Share2,
  ShieldCheck,
  Wallet,
} from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { colors, shadows, surfaceFrameStyle, surfaceChromeCircleStyle, textStyles, borderRadius, spacing, fontSize, fontFamily } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import { PremiumModalSheet } from '../../components/premium'
import { getApiBaseUrl } from '../../lib/apiClient'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useScope } from '../../query/scope'
import {
  useConsumerDepositAddresses,
  useConsumerVirtualAccounts,
} from '../../hooks/queries/use-receive-deposit-queries'
import QRCode from 'react-native-qrcode-svg'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import { haptics } from '../../lib/haptics'
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'
import { NgLocalVerificationNotice } from '../../components/compliance/NgLocalVerificationNotice'
import { useYcReceiveRails } from '../../hooks/useYcFundBalanceFlow'
import type { YcPayInRail } from '../../hooks/useYcCrossBorderFlow'
import { ReceiveCashMethodList } from '../../components/receive/ReceiveCashMethodList'
import {
  resolveWarmYcLocalDepositCorridor,
  ensureYcLocalDepositCachesReady,
  prefetchNgLocalVerification,
  readCachedNgLocalMissingType,
} from '../../lib/warmYcLocalDepositCaches'
import { useStackHardwareBack } from '../../hooks/useStackHardwareBack'
import { navigateStackBack } from '../../navigation/stackBackNavigation'

type TabType = 'cash' | 'stablecoin'

export default function ReceiveMoneyScreen({ navigation, route }: NavigationProps) {
  const scrollBottomPadding = useScrollBottomPadding(spacing[5])
  const { user, userProfile, refreshUserProfile } = useAuth()
  const copyToClipboard = useCopyToClipboard()
  const queryClient = useQueryClient()
  const { scope } = useScope()
  const vaQuery = useConsumerVirtualAccounts()
  const depositQuery = useConsumerDepositAddresses()

  const [activeTab, setActiveTab] = useState<TabType>('cash')
  const [copiedStates, setCopiedStates] = useState<{ [key: string]: boolean }>({})
  const [aboutSheetOpen, setAboutSheetOpen] = useState(false)
  const [ngMissingType, setNgMissingType] = useState<NgLocalIdType | null>(null)

  const currency = ((route.params as any)?.currency || 'USD') as 'USD' | 'EUR'
  const supportsStablecoins = currency === 'USD' || currency === 'EUR'

  const handleBack = useCallback(() => navigateStackBack(navigation), [navigation])
  useStackHardwareBack(handleBack)

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

  const depLine = currency === 'USD' ? depositQuery.data?.USD : depositQuery.data?.EUR
  const turnkeyDepositAddress =
    depLine?.ownerAddress &&
    depLine.ownerAddress !== 'Loading...' &&
    depLine.ownerAddress !== 'Wallet address not available'
      ? depLine.ownerAddress.trim()
      : null
  const turnkeyDepositMemo = depLine?.memo?.trim() ? depLine.memo : null

  /** Gate empty-state cards so we never flash "setup in progress" before the query settled (cached data shows immediately). */
  const vaFetched = vaQuery.isFetched
  const depositFetched = depositQuery.isFetched

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

  const hasStablecoinData = Boolean(
    turnkeyDepositAddress &&
      turnkeyDepositAddress !== 'Loading...' &&
      turnkeyDepositAddress !== 'Wallet address not available',
  )

  const vaSettled = isVaAnswerSettled({
    isFetched: vaFetched,
    hasCachedEntry: vaRecord != null,
  })
  const verificationComplete = kycStatus === 'approved'
  const showStablecoinDepositDetails = verificationComplete && hasStablecoinData
  const showBankTab = shouldShowBankDepositTab({
    verificationComplete,
    vaSettled,
    hasVirtualAccount: hasAccountData,
  })
  const showStablecoinTab = supportsStablecoins
  const localPayInCurrency = useMemo(() => {
    const cc = String(userProfile?.residence_country ?? '').trim().toUpperCase()
    return mapResidenceToLocalPayInCurrency(cc)
  }, [userProfile?.residence_country])

  const residenceCountry = String(userProfile?.residence_country ?? '').trim().toUpperCase()

  const needsYcReceiveRails =
    verificationComplete && currency === 'USD' && Boolean(localPayInCurrency && residenceCountry)

  useFocusEffect(
    React.useCallback(() => {
      const corridor = resolveWarmYcLocalDepositCorridor(userProfile, {
        kycApproved: verificationComplete,
      })
      if (!corridor) return
      void ensureYcLocalDepositCachesReady(corridor)
    }, [userProfile, verificationComplete]),
  )

  const { rails: receiveRails, blocking: receiveRailsBlocking } = useYcReceiveRails({
    country: residenceCountry || null,
    currency: localPayInCurrency,
    enabled: needsYcReceiveRails,
  })

  const cashMethodsReady = !needsYcReceiveRails || !receiveRailsBlocking

  const showLocalTab =
    Boolean(localPayInCurrency) &&
    verificationComplete &&
    currency === 'USD' &&
    cashMethodsReady &&
    Boolean(receiveRails?.anyAvailable)
  const showCashTab = showBankTab || showLocalTab
  const showTabBar = showCashTab && showStablecoinTab

  const bankAvailable = receiveRails?.rails.bank_transfer.available ?? false
  const momoAvailable = receiveRails?.rails.mobile_money.available ?? false
  const localDepositBlocked = Boolean(localPayInCurrency === 'NGN' && ngMissingType)

  const navigateToBankDetails = () => {
    haptics.medium()
    navigation.navigate('ReceiveBankDetails' as never, { currency } as never)
  }

  const navigateToLocalDeposit = (payInRail: YcPayInRail) => {
    if (!localPayInCurrency || !residenceCountry || localDepositBlocked) return
    haptics.medium()
    navigation.navigate('ReceiveLocalAmount' as never, {
      localPayInCurrency,
      residenceCountry,
      payInRail,
      bankAvailable,
      momoAvailable,
      ngMissingType,
    } as never)
  }

  useEffect(() => {
    if (localPayInCurrency !== 'NGN' || !verificationComplete || currency !== 'USD' || !residenceCountry) {
      setNgMissingType(null)
      return
    }
    const cachedMissing = readCachedNgLocalMissingType(residenceCountry)
    if (cachedMissing !== undefined) {
      setNgMissingType(cachedMissing)
    }
    let cancelled = false
    void (async () => {
      const missingType = await prefetchNgLocalVerification(residenceCountry)
      if (!cancelled) setNgMissingType(missingType)
    })()
    return () => {
      cancelled = true
    }
  }, [localPayInCurrency, verificationComplete, currency, residenceCountry])

  const accountReady = hasAccountData

  const walletReady = hasStablecoinData

  const accountCreationTriggeredRef = useRef(false)
  const prevKycStatusRef = useRef<string | null>(null)
  /** Avoid treating first focus after mount as a KYC transition (null → status), which was replaying the notice. */
  const isFirstFocusAfterMountRef = useRef(true)

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
  
  
  // Automatically create accounts when KYC is approved but accounts don't exist
  useEffect(() => {
    const autoCreateAccounts = async () => {
      // Only trigger if KYC is approved
      if (kycStatus !== 'approved') {
        accountCreationTriggeredRef.current = false
        return
      }

      if (vaSettled && !hasAccountData) {
        accountCreationTriggeredRef.current = false
        return
      }
      
      // Check if accounts already exist
      if (accountReady || walletReady) {
        accountCreationTriggeredRef.current = false
        return
      }
      
      // Prevent multiple triggers
      if (accountCreationTriggeredRef.current) return
      
      // Check database to see if accounts exist
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        
        const { data: userProfileData } = await supabase
          .from('users')
          .select('noah_usd_virtual_account_id, noah_eur_virtual_account_id, noah_kyc_status')
          .eq('id', session.user.id)
          .single()
        
        if (userProfileData) {
          const currencyLower = currency.toLowerCase() as 'usd' | 'eur'
          const accountId = currencyLower === 'usd' 
            ? userProfileData.noah_usd_virtual_account_id 
            : userProfileData.noah_eur_virtual_account_id
          
          // If fiat virtual account is missing, trigger create-accounts provisioning
          if (!accountId) {
            accountCreationTriggeredRef.current = true
            console.log('[RECEIVE-MONEY] KYC approved but accounts missing, triggering create-accounts provisioning...')
            try {
              const syncResponse = await fetch(`${getApiBaseUrl()}/api/noah/create-accounts`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json',
                },
              })
              
              if (syncResponse.ok) {
                console.log('[RECEIVE-MONEY] ✅ create-accounts completed, accounts should be created')
                setTimeout(() => {
                  if (scope) {
                    void queryClient.invalidateQueries({ queryKey: qk.wallets.root(scope) })
                  }
                }, 3000)
              }
            } catch (syncError) {
              console.error('[RECEIVE-MONEY] Error triggering create-accounts:', syncError)
              accountCreationTriggeredRef.current = false // Allow retry on error
            }
          }
        }
      } catch (error) {
        console.error('[RECEIVE-MONEY] Error checking accounts for auto-creation:', error)
        accountCreationTriggeredRef.current = false // Allow retry on error
      }
    }
    
    // Only run when KYC status changes to approved
    autoCreateAccounts()
  }, [kycStatus, currency, accountReady, walletReady, vaSettled, hasAccountData])
  
  // Refresh on focus and re-evaluate account state when verification status changes.
  useFocusEffect(
    React.useCallback(() => {
      const now = Date.now()
      if (now - profileRefreshAtRef.current > PROFILE_REFRESH_TTL_MS) {
        profileRefreshAtRef.current = now
        void refreshUserProfile?.()
      }
      const prev = prevKycStatusRef.current

      if (isFirstFocusAfterMountRef.current) {
        isFirstFocusAfterMountRef.current = false
        prevKycStatusRef.current = kycStatus
      } else {
        const kycChanged = prev !== kycStatus
        prevKycStatusRef.current = kycStatus
        if (kycChanged && scope) {
          void queryClient.invalidateQueries({ queryKey: qk.wallets.root(scope) })
          return
        }
      }
    }, [kycStatus, queryClient, refreshUserProfile, scope]),
  )
  
  // Set default tab based on cash vs stablecoin availability
  useEffect(() => {
    if (!showCashTab && showStablecoinTab) {
      setActiveTab('stablecoin')
      return
    }
    if (showCashTab) {
      setActiveTab('cash')
    }
  }, [showCashTab, showStablecoinTab])

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

      if (stablecoinData.address) {
        // Format stablecoin details for sharing
        const stablecoinName = currency.toLowerCase() === 'usd' ? 'USDC' : 'EURC'
        const networkTicker = stablecoinData.network === 'Solana' ? 'SOL' : stablecoinData.network.toUpperCase()
        const networkName = stablecoinData.network
        let shareText = `Your Stablecoin ${stablecoinName} Details\n\n`
        
        shareText += `Network: ${networkTicker} • ${networkName}\n`
        shareText += `Address: ${stablecoinData.address}\n`
        
        if (stablecoinData.memo) {
          shareText += `Memo (Required): ${stablecoinData.memo}\n`
        }
        
        await Share.share({
          message: shareText,
          title: `${stablecoinName} Details`,
        })
      }
    } catch (error: any) {
      // User cancelled or error occurred - silently fail
      if (error.message !== 'User did not share') {
        console.error('Error sharing:', error)
      }
    }
  }

  /** Turnkey Solana vault for this currency tab. */
  const getStablecoinAddress = () => {
    const raw = turnkeyDepositAddress || ''
    const memo = turnkeyDepositMemo || undefined
    const addrValid =
      Boolean(raw) && raw !== 'Loading...' && raw !== 'Wallet address not available'

    return {
      address: addrValid ? raw : '',
      network: 'Solana',
      supportedStablecoins: currency === 'USD' ? ['USDC'] : ['EURC'],
      memo: addrValid ? memo : undefined,
      isLiquidationAddress: false,
    }
  }

  const stablecoinData = getStablecoinAddress()
  const stablecoinName = currency.toLowerCase() === 'usd' ? 'USDC' : 'EURC'
  const effectiveTab: TabType = showTabBar ? activeTab : showCashTab ? 'cash' : 'stablecoin'

  const aboutSheetTitle = `About your ${stablecoinName} Address`
  const aboutSheetIntro = `Please, take note of the following when sending ${stablecoinName} to your address:`

  const aboutPaymentNotes = useMemo(
    () => [
      `Only send ${stablecoinName} on Solana to this address.`,
      'Sending other assets or networks may result in permanent loss.',
      'Processing time: within seconds.',
    ],
    [stablecoinName],
  )

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

  const renderDepositVerificationNotice = (surface: 'cash' | 'stablecoin') => {
    const stablecoinLabel = currency.toLowerCase() === 'usd' ? 'USDC' : 'EURC'
    const title =
      kycStatus === 'in_review'
        ? 'Verification in Review'
        : kycStatus === 'approved' && surface === 'stablecoin'
          ? `${stablecoinLabel} Address Setup in Progress`
          : surface === 'cash'
            ? 'Complete Verification to get an account'
            : `Complete Verification for ${stablecoinLabel} address`

    const body =
      kycStatus === 'in_review'
        ? 'Your verification is currently being reviewed.'
        : !kycStatus
          ? surface === 'cash'
            ? 'Please complete your identity verification to receive bank and local cash deposit information.'
            : 'Please complete your identity verification to receive bank and stablecoin deposit information.'
          : kycStatus === 'rejected'
            ? surface === 'cash'
              ? 'Your verification was not approved. Please complete identity verification again to receive your account details.'
              : 'Your verification was not approved. Please complete identity verification again to receive your wallet address.'
            : kycStatus === 'approved' && surface === 'stablecoin'
              ? `Your ${stablecoinLabel} address is being set up. This may take a few moments. Please check back shortly.`
              : 'Please complete your identity verification to receive bank and stablecoin deposit information.'

    return (
      <View style={styles.kycNoticeContainer}>
        <View style={styles.kycNoticeIconContainer}>
          <ShieldCheck size={32} color={colors.primary.main} strokeWidth={2} />
        </View>
        <Text style={styles.kycNoticeTitle}>{title}</Text>
        <Text style={styles.kycNoticeText}>{body}</Text>
        {kycStatus !== 'approved' && kycStatus !== 'in_review' ? (
          <Pressable
            android_ripple={ripple.neutral}
            style={styles.kycNoticeButton}
            onPress={() => {
              haptics.medium()
              navigation.navigate('AccountVerification' as any)
            }}
          >
            <Text style={styles.kycNoticeButtonText}>Complete Verification</Text>
            <ArrowRight size={18} color={colors.text.inverse} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>
    )
  }

  const renderDetailActions = () => (
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
        onPress={async () => {
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
  )

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        {/* Header */}
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
              <Text style={styles.title}>Receive Money</Text>
              <View style={styles.currencyDisplay}>
                <CurrencyFlag currency={currency} size={24} style={styles.currencyFlag} />
                <Text style={styles.currencyText}>{currency}</Text>
              </View>
            </View>
          </View>
        </View>

        {showTabBar ? (
          <View style={styles.tabsContainer}>
            <Pressable
              android_ripple={ripple.neutral}
              style={[styles.tab, activeTab === 'cash' && styles.tabActive]}
              onPress={() => {
                haptics.tap()
                setActiveTab('cash')
              }}
            >
              <Text style={[styles.tabText, activeTab === 'cash' && styles.tabTextActive]}>
                Cash
              </Text>
            </Pressable>
            <Pressable
              android_ripple={ripple.neutral}
              style={[styles.tab, activeTab === 'stablecoin' && styles.tabActive]}
              onPress={() => {
                haptics.tap()
                setActiveTab('stablecoin')
              }}
            >
              <Text style={[styles.tabText, activeTab === 'stablecoin' && styles.tabTextActive]}>
                Stablecoin
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Content */}
        <ScrollView 
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
        >
          <View style={styles.content}>
            {effectiveTab === 'cash' && showCashTab ? (
              !verificationComplete ? (
                renderDepositVerificationNotice('cash')
              ) : !cashMethodsReady ? null : (
              <View style={{ gap: spacing[4] }}>
                {localPayInCurrency === 'NGN' && ngMissingType ? (
                  <NgLocalVerificationNotice
                    missingType={ngMissingType}
                    onSaved={() => {
                      setNgMissingType(null)
                      void refreshUserProfile?.()
                    }}
                  />
                ) : null}

                <ReceiveCashMethodList
                  currency={currency}
                  residenceCountry={residenceCountry}
                  showBankRow={showBankTab}
                  showLocalRows={showLocalTab}
                  localPayInCurrency={localPayInCurrency}
                  bankAvailable={bankAvailable}
                  momoAvailable={momoAvailable}
                  localDepositBlocked={localDepositBlocked}
                  onBankPress={navigateToBankDetails}
                  onLocalBankPress={() => navigateToLocalDeposit('bank_transfer')}
                  onLocalMomoPress={() => navigateToLocalDeposit('mobile_money')}
                />
              </View>
              )
            ) : effectiveTab === 'stablecoin' && showStablecoinTab ? (
              <>
                {/* Stablecoin rails only while KYC approved; otherwise verification notice. */}
                {showStablecoinDepositDetails && stablecoinData.address ? (
                  /* Show wallet details when we have wallet data */
                  <>
                    {/* Stablecoin Details */}
                    <View style={styles.section}>
                      {/* QR Code - First */}
                      {stablecoinData.address && (
                        <View style={styles.qrSection}>
                          <View style={styles.qrContainer}>
                            <QRCode
                              value={stablecoinData.address}
                              size={200}
                              color={colors.text.primary}
                              backgroundColor={colors.background.primary}
                            />
                          </View>
                          <Text style={styles.qrHint}>Scan to send {stablecoinData.supportedStablecoins.join(' or ')}</Text>
                        </View>
                      )}

                      {/* Network field - formatted as ticker (left) and full name (right end) */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.fieldLabel}>Network</Text>
                        <View style={styles.fieldValueContainer}>
                          <View style={styles.networkValueContainer}>
                            <Text style={styles.networkTicker}>SOL</Text>
                            <View style={styles.networkNameContainer}>
                              <Text style={styles.networkName}>Solana</Text>
                            </View>
                          </View>
                        </View>
                      </View>

                      {/* Address */}
                      {stablecoinData.address && (
                        renderCopyableField(
                          currency.toLowerCase() === 'usd' ? 'USDC Address' : 'EURC Address',
                          stablecoinData.address,
                          'stablecoinAddress',
                        )
                      )}

                      {/* Memo */}
                      {stablecoinData.memo && (
                        <>
                          {renderCopyableField('Memo (Required)', stablecoinData.memo, 'memo')}
                          <View style={styles.memoWarningContainer}>
                            <AlertTriangle size={16} color={colors.warning.main} strokeWidth={2} />
                            <Text style={styles.memoWarning}>
                              Include this memo when sending to this address on {stablecoinData.network}
                            </Text>
                          </View>
                        </>
                      )}
                    </View>

                    {renderDetailActions()}
                  </>
                ) : !verificationComplete || depositFetched ? (
                  renderDepositVerificationNotice('stablecoin')
                ) : null}
              </>
            ) : null}
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
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[2],
    gap: spacing[2],
  },
  tab: {
    flex: 1,
    paddingVertical: spacing[3],
    alignItems: 'center',
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.xl }),
  },
  tabActive: {
    backgroundColor: colors.primary.main,
    borderColor: colors.primary.main,
  },
  tabText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontFamily: fontFamily.medium,
  },
  tabTextActive: {
    color: colors.text.inverse,
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
  sectionTitle: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    marginBottom: spacing[3],
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
  networkValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  networkTicker: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    fontVariant: ['tabular-nums'],
  },
  networkNameContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  networkName: {
    ...textStyles.bodyLarge,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
  },
  memoWarningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[2],
    padding: spacing[2],
    backgroundColor: colors.warning.background,
    borderRadius: borderRadius.md,
  },
  memoWarning: {
    ...textStyles.bodySmall,
    color: colors.warning.dark,
    fontFamily: fontFamily.regular,
    flex: 1,
  },
  supportedStablecoinsContainer: {
    marginTop: spacing[4],
    paddingTop: spacing[4],
    borderTopWidth: 0.5,
    borderTopColor: colors.semantic.border,
  },
  supportedStablecoinsLabel: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
    marginBottom: spacing[2],
  },
  stablecoinChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  stablecoinChip: {
    backgroundColor: colors.primary.main + '10',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderWidth: 0.5,
    borderColor: colors.primary.main + '30',
  },
  stablecoinChipText: {
    ...textStyles.bodySmall,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
  },
  qrSection: {
    alignItems: 'center',
    marginBottom: spacing[5],
  },
  qrContainer: {
    width: 240,
    height: 240,
    borderRadius: borderRadius.xl,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.primary,
    padding: spacing[3],
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    ...shadows.sm,
  },
  qrImage: {
    width: 200,
    height: 200,
    borderRadius: borderRadius.lg,
  },
  qrGradientBackground: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrHint: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
    marginTop: spacing[2],
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
  kycNoticeButtonDisabled: {
    opacity: 0.6,
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
  localRailList: {
    gap: spacing[3],
  },
  localUnavailable: {
    ...textStyles.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing[4],
  },
})
