import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Modal,
} from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import {
  ArrowLeft,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Globe,
  Info,
  Map,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { useFocusEffect } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import { qk } from '@easner/shared'
import ScreenWrapper from '../../components/ScreenWrapper'
import {
  IframeWebViewModalHeader,
  iframeModalTitleTextStyle,
} from '../../components/IframeWebViewModalHeader'
import ExternalLinkModal from '../../components/ExternalLinkModal'
import { useExternalLink } from '../../hooks/useExternalLink'
import { useAuth } from '../../contexts/AuthContext'
import { NavigationProps } from '../../types'
import { getApiBaseUrl } from '../../lib/apiClient'
import { noahService } from '../../lib/noahService'
import { supabase } from '../../lib/supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  colors,
  surfaceFrameStyle,
  surfaceChromeCircleStyle,
  textStyles,
  borderRadius,
  spacing,
  fontSize,
  lineHeight as lineHeightScale,
  motion,
  fontFamily,
} from '../../theme'
import { useCalmParallelEnterWhen } from '../../hooks/useCalmParallelEnter'
import { CONSUMER_TIER_LADDER } from '../../lib/compliance-tier-ladder-copy'
import { isTier1Complete } from '../../lib/compliance'
import { needsNoahVirtualAccountProvision } from '../../lib/noahAccountSync'
import {
  readFiatProvisionResolved,
  writeFiatProvisionResolved,
} from '../../lib/noahFiatProvisionResolved'
import { useScope } from '../../query/scope'
import { useToast } from '../../components/ToastProvider'
import { haptics } from '../../lib/haptics'
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'

const TIER_ICONS: Record<1 | 2 | 3, LucideIcon> = {
  1: Globe,
  2: Map,
  3: CreditCard,
}

function TierGlyph({
  tier,
  size,
  color,
}: {
  tier: 1 | 2 | 3
  size: number
  color: string
}) {
  const Icon = TIER_ICONS[tier]
  return <Icon size={size} color={color} strokeWidth={2} />
}

function tierTitleDisplay(title: string) {
  return title.replace(/\b\w/g, (c) => c.toUpperCase())
}

function AccountVerificationContent({ navigation }: NavigationProps) {
  const { userProfile, refreshUserProfile } = useAuth()
  const queryClient = useQueryClient()
  const { scope } = useScope()
  const insets = useSafeAreaInsets()
  const { showInfo, showError, showSuccess, showWarning } = useToast()

  const [creatingCustomer, setCreatingCustomer] = useState(false)
  const [customerError, setCustomerError] = useState<string | null>(null)
  const [fiatProvisionResolved, setFiatProvisionResolved] = useState(false)
  // Ref to prevent multiple simultaneous Noah / verification status fetches
  const fetchingNoahStatusRef = useRef(false)
  // Ref to track periodic sync interval
  const syncIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref to prevent multiple simultaneous syncs
  const syncingRef = useRef(false)

  // KYC Link state
  const [kycLink, setKycLink] = useState<string | null>(null)
  const [kycLinkId, setKycLinkId] = useState<string | null>(null)
  const [kycStatus, setKycStatus] = useState<string | null>(null)
  const [showKycModal, setShowKycModal] = useState(false)
  const [loadingKyc, setLoadingKyc] = useState(false)
  const [kycCompleted, setKycCompleted] = useState(false)
  const kycProcessedRef = useRef(false)
  const externalLink = useExternalLink()

  // Animation refs
  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current

  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

  useEffect(() => {
    if (!userProfile?.id) {
      setFiatProvisionResolved(false)
      return
    }
    let cancelled = false
    void readFiatProvisionResolved(userProfile.id).then((resolved) => {
      if (!cancelled) setFiatProvisionResolved(resolved)
    })
    return () => {
      cancelled = true
    }
  }, [userProfile?.id])

  // Sync Noah customer status — fetches from the verification API and updates the database
  const syncNoahStatus = useCallback(async (silent: boolean = false, force: boolean = false) => {
    /** Backend resolves `eind_{userId}` when `noah_customer_id` is null — do not require the column. */
    if (!userProfile?.id) return

    if (syncingRef.current) {
      if (!silent) {
        console.log('[SYNC-STATUS] Sync already in progress, skipping')
      }
      return
    }

    /**
     * Lock **before** any await — otherwise concurrent callers all pass the guard and spam
     * POST /api/noah/sync-status (and profile refresh) while the first is still in AsyncStorage/cache.
     */
    syncingRef.current = true
    try {
      const kycRaw = userProfile?.noah_kyc_status
      const kycNorm = typeof kycRaw === 'string' ? kycRaw.trim().toLowerCase() : ''
      /** Pull Noah until approved; after approval, keep syncing until fiat provisioning is resolved. */
      const shouldSyncByStatus =
        kycNorm !== 'approved' ||
        needsNoahVirtualAccountProvision(userProfile, { fiatProvisionResolved })

      if (!shouldSyncByStatus && !force) {
        if (!silent) {
          console.log('[SYNC-STATUS] Approved with fiat accounts present, skipping sync')
        }
        return
      }

      // Throttle only for in-review / rejected polling — never block not_started → approved.
      if (!force) {
        try {
          const kycPulled =
            kycNorm === 'under_review' ||
            kycNorm === 'in_review' ||
            kycNorm === 'rejected'

          if (kycPulled) {
            const SYNC_CACHE_KEY = `easner_noah_sync_${userProfile.id}`
            const cached = await AsyncStorage.getItem(SYNC_CACHE_KEY)

            if (cached) {
              const { lastSyncTime } = JSON.parse(cached) as { lastSyncTime?: number }
              const timeSinceLastSync = Date.now() - (typeof lastSyncTime === 'number' ? lastSyncTime : 0)
              const STALE_THRESHOLD = 10 * 60 * 1000 // 10 minutes

              let dataIsFresh = timeSinceLastSync < STALE_THRESHOLD

              if (userProfile?.updated_at) {
                const dbUpdatedAt = new Date(userProfile.updated_at).getTime()
                const timeSinceDbUpdate = Date.now() - dbUpdatedAt
                if (timeSinceDbUpdate < STALE_THRESHOLD) {
                  dataIsFresh = true
                }
              }

              if (dataIsFresh) {
                const hasRejectionReasons =
                  kycNorm === 'rejected' ? userProfile?.noah_kyc_rejection_reasons : true

                if (hasRejectionReasons) {
                  if (!silent) {
                    console.log(
                      '[SYNC-STATUS] Data is fresh (synced',
                      Math.round(timeSinceLastSync / 1000),
                      'seconds ago), skipping sync',
                    )
                  }
                  return
                }
              }
            }
          }
        } catch (cacheError) {
          if (!silent) {
            console.warn('[SYNC-STATUS] Error checking sync cache:', cacheError)
          }
        }
      }

      if (!silent) {
        console.log('[SYNC-STATUS] Syncing Noah customer status...')
      }

      const result = await noahService.syncStatus({ scope: 'individual' })

      if (result.success && result.synced) {
        if (!silent) {
          console.log('[SYNC-STATUS] ✅ Status synced successfully:', result.data)
        }

        if (result.data?.needsFiatAccounts === false && userProfile.id) {
          await writeFiatProvisionResolved(userProfile.id)
          setFiatProvisionResolved(true)
          if (scope) {
            void queryClient.invalidateQueries({ queryKey: qk.wallets.root(scope) })
          }
        }

        try {
          const SYNC_CACHE_KEY = `easner_noah_sync_${userProfile.id}`
          await AsyncStorage.setItem(
            SYNC_CACHE_KEY,
            JSON.stringify({
              lastSyncTime: Date.now(),
              customerId: userProfile.noah_customer_id ?? null,
            })
          )
        } catch (cacheError) {
          if (!silent) {
            console.warn('[SYNC-STATUS] Error storing sync cache:', cacheError)
          }
        }

        if (refreshUserProfile) {
          await refreshUserProfile()
        }
      } else if (!silent) {
        if (result.code === 'NOAH_CUSTOMER_NOT_FOUND') {
          const tried = result.triedCustomerIds?.length
            ? ` Tried CustomerIDs: ${result.triedCustomerIds.join(', ')}`
            : ''
          console.log(
            `[SYNC-STATUS] No Noah customer in this environment yet (wrong API key or ID mismatch).${tried}`,
          )
        } else {
          console.warn('[SYNC-STATUS] Sync finished without success flag; kycStatus may be missing in response')
        }
      }
    } catch (error: any) {
      const msg = error?.message ?? String(error)
      if (!silent && !/not\s*found/i.test(msg)) {
        console.warn('[SYNC-STATUS] Error syncing status:', msg)
      }
    } finally {
      syncingRef.current = false
    }
  }, [
    userProfile?.id,
    userProfile?.noah_customer_id,
    userProfile?.noah_kyc_status,
    userProfile?.noah_kyc_rejection_reasons,
    userProfile?.updated_at,
    userProfile?.noah_usd_virtual_account_id,
    userProfile?.noah_eur_virtual_account_id,
    refreshUserProfile,
    fiatProvisionResolved,
    queryClient,
    scope,
  ])

  // Force Noah pull when opening this screen (success path calls refreshUserProfile — avoid double-fetch).
  useFocusEffect(
    React.useCallback(() => {
      if (!userProfile?.id) return
      void syncNoahStatus(false, true)
    }, [userProfile?.id, syncNoahStatus]),
  )

  // Initial Noah sync after login runs from `useConsumerKycNoahSync` (main tabs). This screen keeps
  // periodic sync while viewing in-review/rejected flows below.

  // Set up periodic sync while on screen (every 5 minutes)
  // Only sync if status is rejected, under_review, or missing rejection_reasons
  // Use a ref to track the last sync time to prevent rapid successive calls
  const lastSyncTimeRef = useRef<number>(0)
  useEffect(() => {
    if (!userProfile?.id) {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current)
        syncIntervalRef.current = null
      }
      return
    }

    const shouldPeriodicSync = !isTier1Complete(userProfile)
    
    if (shouldPeriodicSync) {
      // Clear any existing interval first
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current)
        syncIntervalRef.current = null
      }
      
      // Only sync immediately if it's been at least 30 seconds since last sync
      // The syncNoahStatus function will also check data freshness internally
      const now = Date.now()
      if (now - lastSyncTimeRef.current > 30000) { // 30 seconds minimum between syncs
        lastSyncTimeRef.current = now
        syncNoahStatus(true, false) // Silent, not forced - will check freshness
      }
      
      // Set up periodic sync every 5 minutes
      // Note: syncNoahStatus will check freshness, so it won't sync if data is < 10 minutes old
      const interval = setInterval(() => {
        const now = Date.now()
        if (now - lastSyncTimeRef.current > 30000) { // Ensure at least 30 seconds between syncs
          lastSyncTimeRef.current = now
          syncNoahStatus(true, false) // Silent, not forced - will check freshness
        }
      }, 5 * 60 * 1000) // 5 minutes
      
      syncIntervalRef.current = interval
      
      return () => {
        if (syncIntervalRef.current) {
          clearInterval(syncIntervalRef.current)
          syncIntervalRef.current = null
        }
      }
    } else {
      // Clear interval if status doesn't require periodic sync
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current)
        syncIntervalRef.current = null
      }
    }
  }, [userProfile?.id, userProfile?.noah_kyc_status, userProfile?.noah_kyc_rejection_reasons, userProfile?.role]) // Don't include syncNoahStatus to prevent loops

  // Check if individual KYC (Noah) is approved
  const noahKycApproved = isTier1Complete(userProfile)
  const kycStatusLower = String(userProfile?.noah_kyc_status ?? '')
    .trim()
    .toLowerCase()
  const noahKycInReview = kycStatusLower === 'under_review' || kycStatusLower === 'in_review'
  const noahKycRejected = kycStatusLower === 'rejected'

  const handleOpenKYC = async () => {
    if (!userProfile?.email) {
      showWarning('Please complete your profile information before starting KYC verification.')
      return
    }
    
    setLoadingKyc(true)
    kycProcessedRef.current = false
    setKycCompleted(false)
    
    try {
      // Always sync latest Noah customer status before opening KYC
      // This ensures we have the current status and rejection_reasons even if database is outdated
      if (userProfile?.noah_customer_id) {
        try {
          console.log('[KYC-OPEN] Syncing Noah status before opening KYC...')
          await syncNoahStatus(false, true) // Not silent, forced - always sync when customer_id is first discovered
        } catch (statusError: any) {
          console.warn('[KYC-OPEN] Could not sync Noah status:', statusError.message)
          // Continue with KYC link creation even if sync fails
        }
      } else {
        // No customer_id yet, but try to check if Noah has a customer for this email
        // This handles the case where customer_id wasn't stored properly
        try {
          console.log('[KYC-OPEN] No noah_customer_id, checking verification API for existing customer...')
          const customerStatus = await noahService.getCustomerStatus()
          if (customerStatus && customerStatus.customerId) {
            // Found a customer! Store it in the database
            console.log('[KYC-OPEN] Found customer in Noah:', customerStatus.customerId)
            const { error: updateError } = await supabase
              .from('users')
              .update({
                noah_customer_id: customerStatus.customerId,
                updated_at: new Date().toISOString(),
              })
              .eq('id', userProfile.id)
            
            if (updateError) {
              console.error('[KYC-OPEN] Error storing customer_id:', updateError)
            } else {
              console.log('[KYC-OPEN] Stored noah_customer_id, now syncing status...')
              
              // Now sync the full status including rejection_reasons
              await syncNoahStatus(false, true) // Not silent, forced - we just discovered customer_id
              
              // Refresh user profile to get updated status
              if (refreshUserProfile) {
                await refreshUserProfile()
              }
            }
          }
        } catch (checkError: any) {
          console.log('[KYC-OPEN] No existing customer found in Noah (this is expected for new users)')
          // This is expected for new users, continue with KYC link creation
        }
      }
      
      // `public.users.full_name` (set at sign-up / profile edit); fallback to email local-part
      const fullName =
        userProfile?.profile?.full_name?.trim() ||
        [userProfile?.profile?.first_name, userProfile?.profile?.last_name].filter(Boolean).join(' ').trim() ||
        userProfile.email.split('@')[0] ||
        'Account holder'
      
      let response
      try {
        response = await noahService.getKycLink(fullName, userProfile.email, 'individual')
      } catch (error: any) {
        // Handle case where Noah returns existing KYC link in error
        if (error.message && error.message.includes('kyc link has already been created')) {
          console.log('[KYC-OPEN] KYC link already exists; response should include it')
          // The error might contain the existing link - check if we can extract it
          // If not, try to get it via customer lookup
          if (userProfile?.noah_customer_id) {
            try {
              const customer = (await noahService.getCustomer(userProfile.noah_customer_id)) as Record<string, unknown>
              const kycLink = customer.kyc_link as string | undefined
              response = {
                kyc_link: kycLink || '',
                kyc_link_id: `customer-${userProfile.noah_customer_id}`,
                kyc_status: userProfile.noah_kyc_status || 'not_started',
                customer_id: userProfile.noah_customer_id,
              }
            } catch (linkError: any) {
              throw new Error(`KYC link already exists. Please check your email or contact support.`)
            }
          } else {
            throw new Error(`KYC link already exists for this email. Please check your email or contact support.`)
          }
        } else {
          throw error
        }
      }
      
      setKycLink(response.kyc_link)
      setKycLinkId(response.kyc_link_id || null)
      setKycStatus(response.kyc_status || 'not_started')
      
      // If customer_id is returned, store it in database and fetch current status from Noah
      if (response.customer_id && userProfile?.id) {
        try {
          // First, store customer_id immediately
          const { error: storeError } = await supabase
            .from('users')
            .update({ 
              noah_customer_id: response.customer_id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', userProfile.id)
          
          if (storeError) {
            console.error('[KYC-OPEN] Error storing customer_id:', storeError)
          } else {
            console.log('[KYC-OPEN] Stored noah_customer_id:', response.customer_id)
          }
          
          // Sync latest status from Noah to ensure we have current data including rejection_reasons
          // This handles cases where database has old/missing status
          try {
            console.log('[KYC-OPEN] Syncing latest customer status from Noah...')
            await syncNoahStatus(false, true) // Not silent, forced - always sync when customer_id is first discovered
          } catch (statusError: any) {
            console.warn('[KYC-OPEN] Could not sync status from Noah:', statusError.message)
            // Fallback: use status from response if sync failed
            if (response.kyc_status) {
              await supabase
                .from('users')
                .update({
                  noah_kyc_status: response.kyc_status,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', userProfile.id)
            }
          }
          
          // Refresh user profile to get updated status immediately
          if (refreshUserProfile) {
            await refreshUserProfile()
          }
        } catch (error: any) {
          console.error('[KYC-OPEN] Error storing customer data:', error)
          // Don't block the flow
        }
      }
      
      if (!response.kyc_link) {
        if ((response as { alreadyOnboarded?: boolean }).alreadyOnboarded) {
          if (refreshUserProfile) await refreshUserProfile()
          const st = String(response.kyc_status || '').toLowerCase()
          if (st === 'approved') {
            showSuccess('Verification is already approved.', 4000)
          } else if (st === 'under_review' || st === 'in_review') {
            showSuccess('Verification is in review. We will notify you when it completes.', 4500)
          } else {
            showWarning('Verification is already in progress. Check back shortly.')
          }
        } else {
          showError('Unable to load KYC verification. Please try again or contact support.')
        }
        setLoadingKyc(false)
        return
      }
      
      // Production Noah HostedURL is checkout.noah.com/kyc?session=… — open as-is in the system browser.
      // ReturnURL (NOAH_ONBOARDING_RETURN_URL) should be /auth/noah-complete?context=kyc on the business web app.
      await externalLink.openLink(response.kyc_link, 'Verification for global banking')
      try {
        await syncNoahStatus(false, true)
        if (refreshUserProfile) await refreshUserProfile()
      } catch {
        // Non-blocking: background hooks may also sync.
      }
    } catch (error: any) {
      console.error('Error opening KYC:', error)
      showError(
        `${error.message || 'Failed to load KYC verification'}\n\nPlease try again or contact support if the issue persists.`,
      )
    } finally {
      setLoadingKyc(false)
    }
  }

  const handleKycModalClose = () => {
    setShowKycModal(false)
    if (refreshUserProfile && userProfile?.id) {
      void refreshUserProfile()
    }
  }

  /** In-app WebView only — legacy Sumsub-style /verify URLs; Noah production uses checkout.noah.com/kyc. */
  const buildKycIframeUrl = (link: string): string => {
    if (!link.includes('/verify')) {
      return link
    }
    const widgetUrl = link.replace('/verify', '/widget')
    const origin = getApiBaseUrl()
    const separator = widgetUrl.includes('?') ? '&' : '?'
    return `${widgetUrl}${separator}iframe-origin=${encodeURIComponent(origin)}`
  }

  // TOS polling removed - relying on:
  // 1. PostMessage from WebView (immediate)
  // 2. Noah webhooks (automatic)
  // 3. sync-status when screen loads (fallback)

  const createNoahCustomer = async (signedAgreementId: string) => {
    if (creatingCustomer) return // Prevent duplicate calls
    
    setCreatingCustomer(true)
    setCustomerError(null)
    
    try {
      await noahService.createCustomerWithKyc({
        signedAgreementId,
        needsUSD: true,
        needsEUR: true,
      })
      
      showSuccess(
        'Account setup in progress. You will receive USD and EUR account details once your verification is approved.',
        4500,
      )
      
      if (refreshUserProfile) {
        await refreshUserProfile()
      }
    } catch (error: any) {
      console.error('Error creating Noah customer:', error)
      setCustomerError(error.message || 'Failed to create Easner account')
      showError(error.message || 'Failed to create your Easner account. Please try again later.')
    } finally {
      setCreatingCustomer(false)
    }
  }

  const getStatusBadge = (status: string | undefined, noahStatus?: string | undefined) => {
    // Always use noah_kyc_status from Supabase (updated via webhooks)
    // The status parameter should be userProfile?.noah_kyc_status
    const displayStatus = status
    
    if (!displayStatus) {
      return (
        <View style={styles.badgeGray}>
          <Text style={styles.badgeTextGray}>Not started</Text>
        </View>
      )
    }

    switch (displayStatus) {
      case "approved":
        return (
          <View style={styles.badgeGreen}>
            <Text style={styles.badgeTextGreen}>Approved</Text>
          </View>
        )
      case "in_review":
      case "under_review":
        return (
          <View style={styles.badgeYellow}>
            <Text style={styles.badgeTextYellow}>In review</Text>
          </View>
        )
      case "rejected":
        return (
          <View style={styles.badgeRed}>
            <Text style={styles.badgeTextRed}>Rejected</Text>
          </View>
        )
      case "incomplete":
        return (
          <View style={styles.badgeGray}>
            <Text style={styles.badgeTextGray}>Incomplete</Text>
          </View>
        )
      case "not_started":
        return (
          <View style={styles.badgeGray}>
            <Text style={styles.badgeTextGray}>Not started</Text>
          </View>
        )
      default:
        return (
          <View style={styles.badgeGray}>
            <Text style={styles.badgeTextGray}>Pending</Text>
          </View>
        )
    }
  }

  const scrollBottomPad = useScrollBottomPadding(spacing[5])

  return (
    <ScreenWrapper>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <ScrollView
          style={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPad }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Premium Header - Matching Send Flow */}
          <Animated.View
            style={[
              styles.header,
              {
                opacity: headerAnim,
                transform: [{
                  translateY: headerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-motion.screenEnterTranslateY, 0],
                  })
                }]
              }
            ]}
          >
            <Pressable
              onPress={async () => {
                haptics.tap()
                navigation.goBack()
              }}
              style={({ pressed }) => [
                styles.backButton,
                pressed && Platform.OS === 'ios' && styles.backButtonPressed,
              ]}
              android_ripple={{ color: 'rgba(0, 0, 0, 0.12)', borderless: false }}
            >
              <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
            </Pressable>
            <View style={styles.headerContent}>
              <Text style={styles.title}>Account verification</Text>
            </View>
          </Animated.View>

          <Animated.View
            style={[
              styles.content,
              {
                opacity: contentAnim,
                transform: [{
                  translateY: contentAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [motion.screenEnterTranslateY, 0],
                  })
                }]
              }
            ]}
          >
            {/* Status Notice - Always shown until approved */}
            {!noahKycApproved && (
              <View style={styles.infoCard}>
                <View style={styles.infoBox}>
                  {noahKycRejected ? (
                    <>
                      <CircleAlert size={20} color={colors.error.main} strokeWidth={2} />
                      <Text style={[styles.infoText, { color: colors.error.main }]}>
                        {userProfile?.noah_kyc_rejection_reasons 
                          ? (Array.isArray(userProfile.noah_kyc_rejection_reasons) && userProfile.noah_kyc_rejection_reasons.length > 0
                              ? (() => {
                                  // Extract unique customer-facing reasons (deduplicate)
                                  const uniqueReasons = new Set<string>()
                                  userProfile.noah_kyc_rejection_reasons.forEach((reasonObj: any) => {
                                    if (typeof reasonObj === 'object' && reasonObj !== null) {
                                      const reason = String(
                                        reasonObj.reason ?? reasonObj.message ?? reasonObj.detail ?? '',
                                      ).trim()
                                      if (reason) {
                                        uniqueReasons.add(reason)
                                      }
                                    } else if (typeof reasonObj === 'string' && reasonObj.trim()) {
                                      uniqueReasons.add(reasonObj.trim())
                                    }
                                  })
                                  
                                  const reasonsArray = Array.from(uniqueReasons)
                                  const reasonsText = reasonsArray.length > 0 
                                    ? reasonsArray.join(". ")
                                    : ''
                                  
                                  return reasonsText
                                    ? `We couldn’t approve your verification: ${reasonsText}. Tap Start below to try again.`
                                    : 'We couldn’t approve your verification. Tap Start below to try again.'
                                })()
                              : typeof userProfile.noah_kyc_rejection_reasons === 'string'
                              ? `We couldn’t approve your verification: ${userProfile.noah_kyc_rejection_reasons}. Tap Start below to try again.`
                              : 'We couldn’t approve your verification. Tap Start below to try again.')
                          : 'We couldn’t approve your verification. Tap Start below to try again.'}
                  </Text>
                    </>
                  ) : noahKycInReview ? (
                    <>
                      <Info size={20} color={colors.warning.main} strokeWidth={2} />
                      <Text style={[styles.infoText, { color: colors.warning.main }]}>
                        Your verification is under review. We will email you when there is an update.
                      </Text>
                    </>
                  ) : (
                    <>
                      <Info size={20} color={colors.primary.main} strokeWidth={2} />
                      <Text style={styles.infoText}>
                        Complete identity verification below to unlock bank accounts, cards, stablecoin and other banking features
                      </Text>
                    </>
                  )}
                </View>
              </View>
            )}

            {/* Tier cards: 1 = Noah KYC; 2–3 = roadmap — always visible (approved = read-only, like business). */}
            <View style={styles.cardsContainer}>
              {noahKycApproved ? (
                <View style={styles.card}>
                  <View style={styles.cardContent}>
                    <View style={styles.cardLeft}>
                      <View style={styles.iconContainer}>
                        <TierGlyph tier={1} size={24} color={colors.primary.main} />
                      </View>
                      <Text style={styles.cardTitle}>
                        {tierTitleDisplay(CONSUMER_TIER_LADDER.tiers[0].title)}
                      </Text>
                      <Text style={styles.cardDescription}>
                        {CONSUMER_TIER_LADDER.tiers[0].description}
                      </Text>
                    </View>
                    <View style={styles.cardRight}>
                      <View style={styles.tierPill}>
                        <Text style={styles.tierPillText}>Tier 1</Text>
                      </View>
                      {getStatusBadge(
                        userProfile?.noah_kyc_status ||
                          userProfile?.profile?.noah_kyc_status ||
                          'approved',
                        userProfile?.noah_kyc_status ||
                          userProfile?.profile?.noah_kyc_status ||
                          'approved',
                      )}
                    </View>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={async () => {
                    haptics.tap()
                    await handleOpenKYC()
                  }}
                  disabled={loadingKyc}
                  style={({ pressed }) => [
                    styles.card,
                    styles.cardInteractive,
                    pressed && Platform.OS === 'ios' && styles.cardPressed,
                  ]}
                  android_ripple={{ color: 'rgba(0, 122, 204, 0.12)', borderless: false }}
                >
                  <View style={styles.cardInner}>
                    <View style={styles.cardContent}>
                      <View style={styles.cardLeft}>
                        <View style={styles.iconContainer}>
                          <TierGlyph tier={1} size={24} color={colors.primary.main} />
                        </View>
                        <Text style={styles.cardTitle}>
                          {tierTitleDisplay(CONSUMER_TIER_LADDER.tiers[0].title)}
                        </Text>
                        <Text style={styles.cardDescription}>
                          {CONSUMER_TIER_LADDER.tiers[0].description}
                        </Text>
                      </View>
                      <View style={styles.cardRight}>
                        {loadingKyc ? (
                          <ActivityIndicator size="small" color={colors.primary.main} />
                        ) : (
                          <>
                            <View style={styles.tierPill}>
                              <Text style={styles.tierPillText}>Tier 1</Text>
                            </View>
                            {getStatusBadge(
                              userProfile?.noah_kyc_status ||
                                userProfile?.profile?.noah_kyc_status ||
                                'not_started',
                              userProfile?.noah_kyc_status ||
                                userProfile?.profile?.noah_kyc_status ||
                                'not_started',
                            )}
                          </>
                        )}
                      </View>
                    </View>
                    {!loadingKyc ? (
                      <View style={styles.startBadge}>
                        <Text style={styles.startBadgeText}>Start</Text>
                        <ChevronRight size={12} color={colors.neutral.white} strokeWidth={2} />
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              )}

              {CONSUMER_TIER_LADDER.tiers.slice(1).map((tier) => (
                <View key={tier.tier} style={styles.card}>
                  <View style={styles.cardContent}>
                    <View style={styles.cardLeft}>
                      <View style={styles.iconContainer}>
                        <TierGlyph tier={tier.tier as 1 | 2 | 3} size={24} color={colors.text.secondary} />
                      </View>
                      <Text style={styles.cardTitle}>{tierTitleDisplay(tier.title)}</Text>
                      <Text style={styles.cardDescription}>{tier.description}</Text>
                    </View>
                    <View style={styles.cardRight}>
                      <View style={styles.tierPill}>
                        <Text style={styles.tierPillText}>Tier {tier.tier}</Text>
                      </View>
                      <View style={styles.comingLaterPill}>
                        <Text style={styles.comingLaterPillText}>Coming later</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* KYC WebView Modal (Noah hosted onboarding — identity + partner terms in one session) */}
            <Modal
              visible={showKycModal}
              animationType="slide"
              presentationStyle="pageSheet"
              onRequestClose={handleKycModalClose}
            >
              <View style={styles.modalContainer}>
                <IframeWebViewModalHeader onClose={handleKycModalClose}>
                    <View style={styles.modalKycTitleRow}>
                      <Text style={[iframeModalTitleTextStyle, styles.modalKycTitleText]} numberOfLines={2}>
                        Verification for global banking
                      </Text>
                      <View style={styles.tierPill}>
                        <Text style={styles.tierPillText}>Tier 1</Text>
                      </View>
                    </View>
                </IframeWebViewModalHeader>
                {kycLink && Platform.OS === 'web' ? (
                  React.createElement('iframe', {
                    src: buildKycIframeUrl(kycLink),
                    title: 'Verification for global banking',
                    style: {
                      flex: 1,
                      width: '100%',
                      height: '100%',
                      border: 'none',
                    },
                  })
                ) : kycLink ? (
                  <WebView
                    source={{ uri: buildKycIframeUrl(kycLink) }}
                    style={styles.webView}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    onShouldStartLoadWithRequest={(request) => {
                      // Suppress warnings for about:srcdoc (used by iframes with inline HTML)
                      if (request.url === 'about:srcdoc') {
                        return false
                      }
                      return true
                    }}
                    onError={(syntheticEvent) => {
                      const { nativeEvent } = syntheticEvent
                      // Suppress harmless about:srcdoc warnings
                      if (nativeEvent.url === 'about:srcdoc') {
                        return
                      }
                      console.warn('[KYC-WEBVIEW] WebView error:', nativeEvent)
                    }}
                    onHttpError={(syntheticEvent) => {
                      const { nativeEvent } = syntheticEvent
                      console.warn('[KYC-WEBVIEW] HTTP error:', nativeEvent.statusCode, nativeEvent.url)
                    }}
                    onMessage={async (event) => {
                      console.log('[KYC-WEBVIEW] 📨 Message received from WebView:', {
                        data: event.nativeEvent.data,
                        type: typeof event.nativeEvent.data,
                        alreadyProcessed: kycProcessedRef.current
                      })
                      
                      if (kycProcessedRef.current) {
                        console.log('[KYC-WEBVIEW] ⚠️ Message already processed, ignoring')
                        return
                      }
                      
                      try {
                        const messageData = event.nativeEvent.data
                        let data: any
                        
                        if (typeof messageData === 'string') {
                          data = JSON.parse(messageData)
                        } else {
                          data = messageData
                        }
                        
                        console.log('[KYC-WEBVIEW] 📋 Parsed message data:', data)
                        
                        // Handle KYC completion
                        if (data && (data.kycCompleted || data.status === 'completed' || data.kyc_status === 'approved' || data.kyc_status === 'under_review')) {
                          console.log('[KYC-WEBVIEW] ✅ KYC completed')
                          kycProcessedRef.current = true
                          setKycCompleted(true)
                          setKycStatus(data.kyc_status || 'approved')
                          
                          // Sync KYC from Noah → Supabase (same POST /api/noah/sync-kyc as business hosted flow)
                          if (userProfile?.id) {
                            try {
                              console.log('[KYC-WEBVIEW] Syncing KYC data from Noah to database...')
                              await noahService.syncKyc()
                              console.log('[KYC-WEBVIEW] ✅ KYC data synced to database')
                              if (refreshUserProfile) {
                                await refreshUserProfile()
                              }
                            } catch (syncError: any) {
                              console.error('[KYC-WEBVIEW] Error syncing KYC data:', syncError)
                              // Don't block the flow - data will be synced via webhook
                            }
                          }
                          
                          showSuccess('Verification submitted. We will update your status shortly.', 3500)
                          handleKycModalClose()
                        }
                      } catch (error: any) {
                        console.error('[KYC-WEBVIEW] Error processing message:', error)
                      }
                    }}
                    onNavigationStateChange={(navState) => {
                      console.log('[KYC-WEBVIEW] Navigation changed:', {
                        url: navState.url,
                        loading: navState.loading,
                      })
                    }}
                  />
                ) : null}
              </View>
            </Modal>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
      <ExternalLinkModal
        visible={externalLink.isVisible}
        url={externalLink.url}
        title={externalLink.title}
        onClose={externalLink.closeLink}
      />
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
  },
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
  backButtonPressed: {
    opacity: 0.7,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
    marginBottom: 2,
    ...Platform.select({
      android: {
        lineHeight: Math.round(fontSize.xl * lineHeightScale.snug) + 4,
        includeFontPadding: false,
      },
      default: {},
    }),
  },
  content: {
    padding: spacing[5],
  },
  infoCard: {
    ...surfaceFrameStyle(colors),
    marginBottom: spacing[4],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  infoText: {
    ...textStyles.bodySmall,
    color: colors.primary.main,
    flex: 1,
    ...Platform.select({
      android: {
        lineHeight: Math.round(fontSize.xs * lineHeightScale.loose) + 4,
        includeFontPadding: false,
      },
      default: {},
    }),
  },
  cardsContainer: {
    gap: spacing[4],
  },
  card: {
    ...surfaceFrameStyle(colors),
    marginBottom: spacing[3],
    position: 'relative',
  },
  cardInteractive: Platform.select({
    android: { overflow: 'hidden' },
    default: {},
  }),
  cardPressed: {
    opacity: 0.92,
  },
  cardInner: {
    width: '100%',
  },
  cardContent: {
    padding: spacing[5],
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardLeft: {
    flex: 1,
    marginRight: spacing[4],
    minWidth: 0,
  },
  tierPill: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.frame.border,
    backgroundColor: colors.background.primary,
  },
  tierPillText: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
    color: colors.text.secondary,
    ...Platform.select({
      android: { lineHeight: 16, includeFontPadding: false },
      default: {},
    }),
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary.main + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  cardTitle: {
    ...textStyles.bodyMedium,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing[1],
    ...Platform.select({
      android: {
        lineHeight: Math.round(fontSize.sm * lineHeightScale.relaxed) + 4,
        includeFontPadding: false,
      },
      default: {},
    }),
  },
  comingLaterPill: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.neutral[100],
  },
  comingLaterPillText: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
    color: colors.text.secondary,
    ...Platform.select({
      android: { lineHeight: 16, includeFontPadding: false },
      default: {},
    }),
  },
  cardDescription: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    lineHeight: 20,
    ...Platform.select({
      android: { lineHeight: 22, includeFontPadding: false },
      default: {},
    }),
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    width: 100,
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
  startBadge: {
    position: 'absolute',
    bottom: spacing[3],
    right: spacing[5],
    backgroundColor: colors.primary.main,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  startBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.neutral.white,
    ...Platform.select({
      android: { lineHeight: 16, includeFontPadding: false },
      default: {},
    }),
  },
  badgeGreen: {
    backgroundColor: colors.success.background,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    minWidth: 70, // Fixed minimum width to prevent layout shifts
    alignItems: 'center',
  },
  badgeTextGreen: {
    ...textStyles.labelSmall,
    fontWeight: '500',
    color: colors.success.dark,
    textTransform: 'none',
    ...Platform.select({
      android: { includeFontPadding: false, lineHeight: 16 },
      default: {},
    }),
  },
  badgeYellow: {
    backgroundColor: colors.warning.background,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    minWidth: 70, // Fixed minimum width to prevent layout shifts
    alignItems: 'center',
  },
  badgeTextYellow: {
    ...textStyles.labelSmall,
    fontWeight: '500',
    color: colors.warning.dark,
    textTransform: 'none',
    ...Platform.select({
      android: { includeFontPadding: false, lineHeight: 16 },
      default: {},
    }),
  },
  badgeRed: {
    backgroundColor: colors.error.background,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    minWidth: 70, // Fixed minimum width to prevent layout shifts
    alignItems: 'center',
  },
  badgeTextRed: {
    ...textStyles.labelSmall,
    fontWeight: '500',
    color: colors.error.dark,
    textTransform: 'none',
    ...Platform.select({
      android: { includeFontPadding: false, lineHeight: 16 },
      default: {},
    }),
  },
  badgeGray: {
    backgroundColor: colors.neutral[100],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    minWidth: 70, // Fixed minimum width to prevent layout shifts
    alignItems: 'center',
  },
  badgeTextGray: {
    ...textStyles.labelSmall,
    fontWeight: '500',
    color: colors.neutral[600],
    textTransform: 'none',
    ...Platform.select({
      android: { includeFontPadding: false, lineHeight: 16 },
      default: {},
    }),
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  modalKycTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing[2],
    flexWrap: 'wrap',
    maxWidth: '100%',
  },
  modalKycTitleText: {
    flexShrink: 1,
    textAlign: 'left',
  },
  webView: {
    flex: 1,
  },
})

export default function AccountVerificationScreen(props: NavigationProps) {
  return <AccountVerificationContent {...props} />
}





