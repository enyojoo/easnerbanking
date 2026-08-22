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
} from 'react-native'
import {
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { colors, shadows, surfaceFrameStyle, surfaceChromeCircleStyle, textStyles, borderRadius, spacing, fontSize, fontFamily } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { getApiBaseUrl } from '../../lib/apiClient'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useScope } from '../../query/scope'
import {
  useConsumerDepositAddresses,
  useConsumerVirtualAccounts,
  useConsumerRelayDepositAddresses,
} from '../../hooks/queries/use-receive-deposit-queries'
import { ReceiveStablecoinMethodList, type StablecoinReceiveMethod } from '../../components/receive/ReceiveStablecoinMethodList'
import { CurrencyFlag } from '../../components/flags/CurrencyFlag'
import { haptics } from '../../lib/haptics'
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'
import { NgLocalVerificationNotice } from '../../components/compliance/NgLocalVerificationNotice'
import { useYcReceiveRails } from '../../hooks/useYcFundBalanceFlow'
import type { YcPayInRail } from '../../hooks/useYcCrossBorderFlow'
import { useSendDestinations } from '../../hooks/useSendDestinations'
import { resolveMobilePayInProvider } from '../../lib/resolveMobilePayInProvider'
import { ReceiveCashMethodList, type ExpressCashKind } from '../../components/receive/ReceiveCashMethodList'
import { apiFetch } from '../../query/api-client'
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
  const queryClient = useQueryClient()
  const { scope } = useScope()
  const currency = ((route.params as any)?.currency || 'USD') as 'USD' | 'EUR'
  const vaQuery = useConsumerVirtualAccounts()
  const depositQuery = useConsumerDepositAddresses()
  const relayDepositQuery = useConsumerRelayDepositAddresses(currency === 'USD')

  const [activeTab, setActiveTab] = useState<TabType>('cash')
  const [ngMissingType, setNgMissingType] = useState<NgLocalIdType | null>(null)
  const [expressReady, setExpressReady] = useState(false)
  const [expressMethods, setExpressMethods] = useState<ExpressCashKind[]>([])

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

  const { catalogRevision } = useSendDestinations()

  const payInProvider = useMemo(
    () =>
      residenceCountry && localPayInCurrency
        ? resolveMobilePayInProvider({
            countryCode: residenceCountry,
            currencyCode: localPayInCurrency,
          })
        : 'yellowcard',
    [residenceCountry, localPayInCurrency, catalogRevision],
  )

  const needsYcReceiveRails =
    verificationComplete && currency === 'USD' && Boolean(localPayInCurrency && residenceCountry)

  const { rails: receiveRails, revalidate: receiveRailsRevalidate } = useYcReceiveRails({
    country: residenceCountry || null,
    currency: localPayInCurrency,
    enabled: needsYcReceiveRails,
    payInProvider,
  })

  useFocusEffect(
    React.useCallback(() => {
      const corridor = resolveWarmYcLocalDepositCorridor(userProfile, {
        kycApproved: verificationComplete,
      })
      if (!corridor) return
      void ensureYcLocalDepositCachesReady({ ...corridor, payInProvider }).then(() => {
        void receiveRailsRevalidate()
      })
    }, [userProfile, verificationComplete, receiveRailsRevalidate, payInProvider]),
  )

  const expectLocalCorridor =
    Boolean(localPayInCurrency) && verificationComplete && currency === 'USD'
  // Instant from cache/optimistic rails – residence rarely changes.
  const showLocalTab = expectLocalCorridor && Boolean(receiveRails?.anyAvailable)
  const showCashTab = showBankTab || showLocalTab
  const showTabBar = showCashTab && showStablecoinTab

  const bankAvailable = receiveRails?.rails.bank_transfer.available ?? false
  const momoAvailable = receiveRails?.rails.mobile_money.available ?? false
  const localDepositBlocked = Boolean(localPayInCurrency === 'NGN' && ngMissingType)

  const navigateToBankDetails = () => {
    haptics.medium()
    navigation.navigate('ReceiveBankDetails' as never, { currency } as never)
  }

  const navigateToLocalDeposit = (payInRail: YcPayInRail, country?: string) => {
    const cc = String(country || residenceCountry || '').trim().toUpperCase()
    const cur = country
      ? mapResidenceToLocalPayInCurrency(cc)
      : localPayInCurrency
    if (!cur || !cc || localDepositBlocked) return
    haptics.medium()
    navigation.navigate('ReceiveLocalAmount' as never, {
      localPayInCurrency: cur,
      residenceCountry: cc,
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

  useEffect(() => {
    if (currency !== 'USD' || !verificationComplete) {
      setExpressMethods([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const data = await apiFetch<{
          eligible?: boolean
          ready?: boolean
          payerCountry?: string | null
          methods?: string[]
          office?: { stripeOnrampEnabled?: boolean }
        }>('/api/stripe/onramp/status')
        if (cancelled) return
        if (data.office?.stripeOnrampEnabled && data.eligible) {
          setExpressReady(Boolean(data.ready))
          const allowed = new Set<ExpressCashKind>([
            'express_card',
            'express_apple_pay',
            'express_google_pay',
            'express_ach',
          ])
          const fromApi = (Array.isArray(data.methods) ? data.methods : []).filter(
            (k): k is ExpressCashKind => allowed.has(k as ExpressCashKind),
          )
          const methods = fromApi.filter((kind) => {
            if (kind === 'express_apple_pay') return Platform.OS === 'ios' || Platform.OS === 'web'
            if (kind === 'express_google_pay') return Platform.OS === 'android' || Platform.OS === 'web'
            return true
          })
          setExpressMethods(methods)
        } else {
          setExpressMethods([])
        }
      } catch {
        if (!cancelled) setExpressMethods([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currency, verificationComplete, residenceCountry])

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

  /** Turnkey Solana vault for this currency tab. */
  const getStablecoinAddress = () => {
    const raw = turnkeyDepositAddress || ''
    const memo = turnkeyDepositMemo || undefined
    const addrValid =
      Boolean(raw) && raw !== 'Loading...' && raw !== 'Wallet address not available'

    return {
      address: addrValid ? raw : '',
      network: 'Solana' as const,
      memo: addrValid ? memo : undefined,
    }
  }

  const stablecoinData = getStablecoinAddress()
  const stablecoinMethods = useMemo((): StablecoinReceiveMethod[] => {
    const methods: StablecoinReceiveMethod[] = []
    if (stablecoinData.address) {
      methods.push({
        id: currency === 'EUR' ? 'eurc-solana' : 'usdc-solana',
        asset: currency === 'EUR' ? 'EURC' : 'USDC',
        network: 'Solana',
        status: 'active',
        address: stablecoinData.address,
        memo: stablecoinData.memo,
      })
    }
    if (currency === 'USD') {
      const relay = relayDepositQuery.data
      if (relay?.enabled) {
        for (const row of relay.addresses ?? []) {
          methods.push({
            id: `relay-${row.asset}-${row.network}`.toLowerCase(),
            asset: row.asset,
            network: row.network,
            status: 'active',
            address: row.address,
          })
        }
        if (relay.status === 'provisioning' && !methods.some((m) => m.asset === 'USDT')) {
          methods.push({
            id: 'usdt-tron-provisioning',
            asset: 'USDT',
            network: 'Tron',
            status: 'provisioning',
          })
        }
      }
    }
    return methods
  }, [currency, relayDepositQuery.data, stablecoinData.address, stablecoinData.memo])

  const effectiveTab: TabType = showTabBar ? activeTab : showCashTab ? 'cash' : 'stablecoin'

  const navigateToStablecoinDetails = (method: StablecoinReceiveMethod) => {
    if (method.status !== 'active' || !method.address) return
    haptics.medium()
    navigation.navigate('ReceiveStablecoinDetails' as never, {
      currency,
      asset: method.asset,
      network: method.network,
      address: method.address,
      memo: method.memo,
    } as never)
  }

  const renderDepositVerificationNotice = (surface: 'cash' | 'stablecoin') => {
    const stablecoinLabel = currency.toLowerCase() === 'usd' ? 'USDC' : 'EURC'
    const title =
      kycStatus === 'in_review'
        ? 'Verification in Review'
        : kycStatus === 'approved' && surface === 'stablecoin'
          ? `${stablecoinLabel} Address Setup in Progress`
          : kycStatus === 'approved' && surface === 'cash'
            ? 'Account Setup in Progress'
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
              ? 'Your verification could not be completed. Please complete identity verification again to receive your account details.'
              : 'Your verification could not be completed. Please complete identity verification again to receive your wallet address.'
            : kycStatus === 'approved' && surface === 'stablecoin'
              ? `Your ${stablecoinLabel} address is being set up. This may take a few moments. Please check back shortly.`
              : kycStatus === 'approved' && surface === 'cash'
                ? 'Your bank account details are being set up. This may take a few moments. Please check back shortly.'
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
              <Text style={styles.title}>Add money</Text>
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
              ) : (
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
                  onLocalBankPress={(country) => navigateToLocalDeposit('bank_transfer', country)}
                  onLocalMomoPress={() => navigateToLocalDeposit('mobile_money')}
                  expressMethods={expressMethods}
                  expressReady={expressReady}
                  onExpressPress={(kind) => {
                    haptics.medium()
                    if (!expressReady) {
                      navigation.navigate('ExpressDepositsSetup' as never)
                      return
                    }
                    navigation.navigate('ExpressDepositAmount' as never, { method: kind } as never)
                  }}
                />
              </View>
              )
            ) : effectiveTab === 'stablecoin' && showStablecoinTab ? (
              !verificationComplete || !showStablecoinDepositDetails ? (
                !verificationComplete || depositFetched ? (
                  renderDepositVerificationNotice('stablecoin')
                ) : null
              ) : (
                <View style={{ gap: spacing[4] }}>
                  <ReceiveStablecoinMethodList
                    methods={stablecoinMethods}
                    onSelect={navigateToStablecoinDetails}
                  />
                </View>
              )
            ) : null}
          </View>
        </ScrollView>
      </View>
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
  backToMethodsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  backToMethodsText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.medium,
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
