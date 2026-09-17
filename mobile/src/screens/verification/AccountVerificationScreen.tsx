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
} from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import {
  ArrowLeft,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Globe,
  Info,
  Zap,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import { qk, canResubmitNoahVerification, getNoahRejectionDisplay, NOAH_FINAL_REJECTION_USER_MESSAGE, NOAH_VERIFICATION_IN_REVIEW_COPY, VERIFICATION_STATUS_COPY, verificationStatusLabel, EXPRESS_DEPOSITS_COPY, expressDepositsPayerCountry, expressDepositsVerificationCta, isStripeOnrampPayerEligible } from '@easner/shared'
import ScreenWrapper from '../../components/ScreenWrapper'
import { CenteredWebFlowPage } from '../../components/layout/CenteredWebFlowPage'
import ExternalLinkModal from '../../components/ExternalLinkModal'
import BridgeHostedVerificationModal from '../../components/BridgeHostedVerificationModal'
import { useExternalLink } from '../../hooks/useExternalLink'
import { useBridgeHostedVerification } from '../../hooks/useBridgeHostedVerification'
import { useAuth } from '../../contexts/AuthContext'
import { NavigationProps } from '../../types'
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
import { CONSUMER_VERIFICATION_PRODUCTS } from '../../lib/compliance-tier-ladder-copy'
import { bridgeService } from '../../lib/bridgeService'
import {
  bridgeCutoverDeadlineLabel,
  consumerBankKycStatus,
  isBridgeConsumerCutoverPending,
  shouldUseBridgeConsumerKyc,
} from '../../lib/bridgeConsumerKyc'

const GLOBAL_BANKING_PRODUCT = CONSUMER_VERIFICATION_PRODUCTS.find((p) => p.id === 'global_banking')!
import {
  fetchExpressOnrampStatus,
  peekExpressOnrampStatus,
  subscribeExpressOnrampStatus,
  warmExpressOnrampStatus,
} from '../../lib/expressOnrampStatusCache'
import { isGlobalBankingVerified } from '../../lib/compliance'
import {
  readPendingResidenceCountry,
  residenceCountryFromProfile,
  resolveResidenceCountryForUser,
  saveResidenceCountryToUser,
} from '../../lib/residenceCountryPersist'
import { loadMobileExpressOnramp } from '../../lib/express-onramp'
import { needsNoahVirtualAccountProvision } from '../../lib/noahAccountSync'
import {
  readFiatProvisionResolved,
  writeFiatProvisionResolved,
} from '../../lib/noahFiatProvisionResolved'
import { useScope } from '../../query/scope'
import { useToast } from '../../components/ToastProvider'
import { haptics } from '../../lib/haptics'
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'
import { KycRequiredDocumentsNotice } from '../../components/compliance/KycRequiredDocumentsNotice'
import { ResidenceCountryField } from '../../components/compliance/ResidenceCountryField'
import { WebAwareModal } from '../../components/WebAwareModal'
import GlossyPrimaryButton from '../../components/premium/GlossyPrimaryButton'

const PRODUCT_ICONS: Record<string, LucideIcon> = {
  global_banking: Globe,
  cards: CreditCard,
}

function ProductGlyph({
  id,
  size,
  color,
}: {
  id: string
  size: number
  color: string
}) {
  const Icon = PRODUCT_ICONS[id] || Globe
  return <Icon size={size} color={color} strokeWidth={2} />
}

function tierTitleDisplay(title: string) {
  return title.replace(/\b\w/g, (c) => c.toUpperCase())
}

function expressVerificationStatus(data: { ready?: boolean; status?: string } | null | undefined) {
  if (data?.ready) return 'approved'
  const status = String(data?.status || '').toLowerCase()
  if (status === 'ready') return 'approved'
  if (status === 'in_progress' || status === 'in_review') return 'in_progress'
  return 'not_started'
}

function AccountVerificationContent({ navigation }: NavigationProps) {
  const { user, userProfile, refreshUserProfile } = useAuth()
  const queryClient = useQueryClient()
  const { scope } = useScope()
  const insets = useSafeAreaInsets()
  const { showInfo, showError, showSuccess, showWarning } = useToast()

  const [fiatProvisionResolved, setFiatProvisionResolved] = useState(false)
  // Ref to prevent multiple simultaneous Noah / verification status fetches
  const fetchingNoahStatusRef = useRef(false)
  // Ref to track periodic sync interval
  const syncIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref to prevent multiple simultaneous syncs
  const syncingRef = useRef(false)

  // KYC open state (hosted link opens via in-app browser – same as Legal)
  const [loadingKyc, setLoadingKyc] = useState(false)
  const externalLink = useExternalLink()
  const bridgeHosted = useBridgeHostedVerification()
  const [legacyResidenceOpen, setLegacyResidenceOpen] = useState(false)
  const [legacyResidenceCode, setLegacyResidenceCode] = useState('')
  const [legacyResidenceError, setLegacyResidenceError] = useState<string | null>(null)
  const [savingLegacyResidence, setSavingLegacyResidence] = useState(false)

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

  // Sync Noah customer status – fetches from the verification API and updates the database
  const syncNoahStatus = useCallback(async (silent: boolean = false, force: boolean = false) => {
    /** Backend resolves `eind_{userId}` when `noah_customer_id` is null – do not require the column. */
    if (!userProfile?.id) return

    if (syncingRef.current) {
      if (!silent) {
        console.log('[SYNC-STATUS] Sync already in progress, skipping')
      }
      return
    }

    /**
     * Lock **before** any await – otherwise concurrent callers all pass the guard and spam
     * POST /api/noah/sync-status (and profile refresh) while the first is still in AsyncStorage/cache.
     */
    syncingRef.current = true
    try {
      const usesBridge = shouldUseBridgeConsumerKyc(userProfile)
      const kycRaw = usesBridge
        ? consumerBankKycStatus(userProfile)
        : userProfile?.noah_kyc_status
      const kycNorm = typeof kycRaw === 'string' ? kycRaw.trim().toLowerCase() : ''
      /** Pull until approved; after approval, keep syncing until fiat provisioning is resolved. */
      const shouldSyncByStatus =
        kycNorm !== 'approved' ||
        (!usesBridge && needsNoahVirtualAccountProvision(userProfile, { fiatProvisionResolved }))

      if (!shouldSyncByStatus) {
        if (!silent) {
          console.log('[SYNC-STATUS] Approved with fiat accounts present, skipping sync')
        }
        return
      }

      // Throttle only for in-review / rejected polling – never block not_started → approved.
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
        console.log('[SYNC-STATUS] Syncing verification status...')
      }

      if (usesBridge) {
        const result = await bridgeService.syncStatus()
        if (result.provisioned && userProfile.id) {
          await writeFiatProvisionResolved(userProfile.id)
          setFiatProvisionResolved(true)
          if (scope) {
            void queryClient.invalidateQueries({ queryKey: qk.wallets.root(scope) })
          }
        }
        if (refreshUserProfile) await refreshUserProfile()
        return
      }

      const needsAccounts = needsNoahVirtualAccountProvision(userProfile, { fiatProvisionResolved })
      const result = needsAccounts
        ? await noahService.syncStatusUntilAccountsReady({ scope: 'individual' })
        : await noahService.syncStatus({ scope: 'individual' })

      if (result.success && result.synced) {
        if (!silent) {
          console.log('[SYNC-STATUS] ✅ Status synced successfully:', result.data)
        }

        if (
          (result.data?.needsFiatAccounts === false || result.accountsReady === true) &&
          userProfile.id
        ) {
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

  const syncNoahStatusRef = useRef(syncNoahStatus)
  syncNoahStatusRef.current = syncNoahStatus

  // One pull per visit. Do not depend on `syncNoahStatus` — a successful sync refreshes
  // the profile and would retrigger this while focused (looks like a 1s loop).
  useFocusEffect(
    useCallback(() => {
      if (!userProfile?.id) return
      void syncNoahStatusRef.current(false, true)
    }, [userProfile?.id]),
  )

  useEffect(() => {
    const id = userProfile?.id
    if (!id || residenceCountryFromProfile(userProfile)) return
    let cancelled = false
    void readPendingResidenceCountry().then(async (pending) => {
      if (!pending || cancelled) return
      try {
        await saveResidenceCountryToUser(id, pending)
        if (!cancelled && refreshUserProfile) await refreshUserProfile()
      } catch {
        // Start still uses pending via resolveResidenceCountryForUser.
      }
    })
    return () => {
      cancelled = true
    }
  }, [refreshUserProfile, userProfile])

  const [expressEligible, setExpressEligible] = useState<boolean | null>(() => {
    const peeked = peekExpressOnrampStatus()
    return typeof peeked?.eligible === 'boolean' ? peeked.eligible : null
  })
  const [expressStatus, setExpressStatus] = useState(
    () => expressVerificationStatus(peekExpressOnrampStatus()),
  )

  const localExpressCountry = expressDepositsPayerCountry({
    residenceCountry: userProfile?.residence_country ?? userProfile?.profile?.residence_country,
    kycAddressCountry: userProfile?.profile?.kyc_address_country,
  })
  const localExpressEligible = isStripeOnrampPayerEligible({ country: localExpressCountry })
  const showExpressCard = Boolean(expressEligible ?? localExpressEligible)
  const expressCta = expressDepositsVerificationCta(expressStatus)

  const applyExpressStatus = useCallback((data: { eligible?: boolean; ready?: boolean; status?: string } | null) => {
    setExpressEligible(typeof data?.eligible === 'boolean' ? data.eligible : null)
    setExpressStatus(expressVerificationStatus(data))
  }, [])
  useEffect(() => {
    warmExpressOnrampStatus()
    applyExpressStatus(peekExpressOnrampStatus())
    const unsub = subscribeExpressOnrampStatus(() => applyExpressStatus(peekExpressOnrampStatus()))
    void fetchExpressOnrampStatus(false)
      .then((data) => applyExpressStatus(data))
      .catch(() => undefined)
    return unsub
  }, [applyExpressStatus, userProfile?.id])
  useFocusEffect(
    useCallback(() => {
      applyExpressStatus(peekExpressOnrampStatus())
      void fetchExpressOnrampStatus(false)
        .then((data) => applyExpressStatus(data))
        .catch(() => undefined)
    }, [applyExpressStatus]),
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

    const shouldPeriodicSync = !isGlobalBankingVerified(userProfile)
    
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

  // Check if individual bank KYC is approved (Bridge, or Noah for NY)
  const bankKycStatus = consumerBankKycStatus(userProfile)
  const cutoverPending = isBridgeConsumerCutoverPending(userProfile)
  const noahKycApproved = bankKycStatus.toLowerCase() === 'approved' && !cutoverPending
  const showExpressCta = Boolean(expressCta) && noahKycApproved
  const kycStatusLower = bankKycStatus.trim().toLowerCase()
  const noahKycInReview = kycStatusLower === 'under_review' || kycStatusLower === 'in_review' || kycStatusLower === 'pending'
  const noahKycRejected = kycStatusLower === 'rejected'
  const rejectionReasons =
    userProfile?.noah_kyc_rejection_reasons ?? userProfile?.profile?.noah_kyc_rejection_reasons
  const rejectionDisplay = noahKycRejected ? getNoahRejectionDisplay(rejectionReasons) : null
  const kycFinalReject = rejectionDisplay?.isFinal === true
  const kycCanResubmit = noahKycRejected ? canResubmitNoahVerification(rejectionReasons) : true
  const residenceCountry = residenceCountryFromProfile(userProfile)

  const proceedOpenKyc = async (residenceOverride?: string) => {
    const email =
      (typeof userProfile?.email === 'string' && userProfile.email.trim()) ||
      (typeof userProfile?.profile?.email === 'string' && userProfile.profile.email.trim()) ||
      (typeof user?.email === 'string' && user.email.trim()) ||
      ''
    if (!email) {
      showWarning(
        'Your account is missing an email address. Sign out and sign back in, or contact support@easner.com.',
      )
      return
    }

    setLoadingKyc(true)
    try {
      const fullName =
        userProfile?.profile?.full_name?.trim() ||
        [userProfile?.profile?.first_name, userProfile?.profile?.last_name].filter(Boolean).join(' ').trim() ||
        email.split('@')[0] ||
        'Account holder'

      if (shouldUseBridgeConsumerKyc(userProfile, residenceOverride)) {
        const response = await bridgeHosted.start({
          fullName,
          email,
          residenceCountry: residenceOverride,
        })
        const tosUrl = String(response.tos_link || '').trim()
        const kycUrl = String(response.kyc_link || '').trim()
        const kycStatus = String(response.kyc_status || '').toLowerCase()
        if (!tosUrl && !kycUrl) {
          try {
            await bridgeService.syncStatus()
            if (refreshUserProfile) await refreshUserProfile()
          } catch {
            // Non-blocking
          }
          if (response.alreadyOnboarded || kycStatus === 'approved') {
            showSuccess('Verification is already complete.', 4000)
            return
          }
          if (kycStatus === 'pending' || kycStatus === 'in_progress' || kycStatus === 'under_review') {
            showWarning('Verification is already in progress. Check back shortly.')
            return
          }
          showError('Unable to load verification. Please try again or contact support.')
          return
        }
        try {
          await syncNoahStatus(false, true)
          if (refreshUserProfile) await refreshUserProfile()
        } catch {
          // Non-blocking
        }
        return
      }

      // Always sync latest Noah customer status before opening KYC
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

      let response
      try {
        response = await noahService.getKycLink(fullName, email, 'individual', {
          residenceCountry: residenceOverride || residenceCountry || undefined,
        })
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
            showSuccess('Verification is already complete.', 4000)
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
      
      // Noah HostedURL (checkout.noah.com/kyc?session=…) – same in-app browser as Legal
      // (SFSafariViewController / Chrome Custom Tabs via useExternalLink).
      // ReturnURL should be /auth/onboarding-complete?context=kyc on the business web app.
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

  const handleOpenKYC = async () => {
    if (kycFinalReject || !kycCanResubmit) {
      showWarning(NOAH_FINAL_REJECTION_USER_MESSAGE)
      return
    }

    const effectiveResidence = await resolveResidenceCountryForUser(userProfile?.id, userProfile)
    if (!effectiveResidence) {
      setLegacyResidenceCode('')
      setLegacyResidenceError(null)
      setLegacyResidenceOpen(true)
      return
    }

    await proceedOpenKyc(effectiveResidence)
  }

  const handleLegacyResidenceContinue = async () => {
    const code = legacyResidenceCode.trim().toUpperCase()
    if (!code) {
      setLegacyResidenceError('Please select your country of residence.')
      return
    }
    setSavingLegacyResidence(true)
    setLegacyResidenceError(null)
    try {
      if (userProfile?.id) {
        await saveResidenceCountryToUser(userProfile.id, code)
        if (refreshUserProfile) await refreshUserProfile()
      }
      await proceedOpenKyc(code)
      setLegacyResidenceOpen(false)
    } catch (error: any) {
      const msg = error?.message ?? 'Could not save your country of residence.'
      if (/not available|COUNTRY_NOT_SUPPORTED/i.test(msg)) {
        setLegacyResidenceError(msg)
      } else {
        setLegacyResidenceError(msg)
      }
    } finally {
      setSavingLegacyResidence(false)
    }
  }

  // Status updates after hosted KYC rely on:
  // 1. Noah webhooks (automatic)
  // 2. sync-status when screen loads / after browser dismiss (fallback)

  const getStatusBadge = (status: string | undefined) => {
    const label = verificationStatusLabel(status, { detail: true })

    if (label === VERIFICATION_STATUS_COPY.verified) {
      return (
        <View style={styles.badgeGreen}>
          <Text style={styles.badgeTextGreen}>{label}</Text>
        </View>
      )
    }
    if (label === VERIFICATION_STATUS_COPY.inProgress) {
      return (
        <View style={styles.badgeYellow}>
          <Text style={styles.badgeTextYellow}>{label}</Text>
        </View>
      )
    }
    if (label === VERIFICATION_STATUS_COPY.inReview) {
      return (
        <View style={styles.badgeYellow}>
          <Text style={styles.badgeTextYellow}>{label}</Text>
        </View>
      )
    }
    if (
      label === VERIFICATION_STATUS_COPY.actionNeeded ||
      label === VERIFICATION_STATUS_COPY.rejected
    ) {
      return (
        <View style={styles.badgeRed}>
          <Text style={styles.badgeTextRed}>{label}</Text>
        </View>
      )
    }
    return (
      <View style={styles.badgeGray}>
        <Text style={styles.badgeTextGray}>{label}</Text>
      </View>
    )
  }

  const scrollBottomPad = useScrollBottomPadding(spacing[5])

  return (
    <ScreenWrapper>
      <CenteredWebFlowPage>
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
                        {kycFinalReject
                          ? NOAH_FINAL_REJECTION_USER_MESSAGE
                          : rejectionDisplay?.guidanceLines?.length
                            ? `Verification needs attention: ${rejectionDisplay.guidanceLines.join(' ')}`
                            : 'Verification was declined. Review your documents and try again, or contact support if you need help.'}
                      </Text>
                    </>
                  ) : noahKycInReview ? (
                    <>
                      <Info size={20} color={colors.warning.main} strokeWidth={2} />
                      <Text style={[styles.infoText, { color: colors.warning.main }]}>
                        {NOAH_VERIFICATION_IN_REVIEW_COPY}
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

            {/* Verification products: Global banking is live; others stay visible as coming later. */}
            {!noahKycApproved && !kycFinalReject ? (
              <KycRequiredDocumentsNotice />
            ) : null}
            <View style={styles.cardsContainer}>
              {noahKycApproved ? (
                <View style={styles.card}>
                  <View style={styles.cardContent}>
                    <View style={styles.cardLeft}>
                      <View style={styles.iconContainer}>
                        <ProductGlyph id="global_banking" size={24} color={colors.primary.main} />
                      </View>
                      <Text style={styles.cardTitle}>
                        {tierTitleDisplay(GLOBAL_BANKING_PRODUCT.title)}
                      </Text>
                      <Text style={styles.cardDescription}>
                        {GLOBAL_BANKING_PRODUCT.description}
                      </Text>
                    </View>
                    <View style={styles.cardRight}>
                      {getStatusBadge(
                        bankKycStatus || 'approved',
                      )}
                    </View>
                  </View>
                </View>
              ) : kycFinalReject ? (
                <View style={styles.card}>
                  <View style={styles.cardContent}>
                    <View style={styles.cardLeft}>
                      <View style={styles.iconContainer}>
                        <ProductGlyph id="global_banking" size={24} color={colors.primary.main} />
                      </View>
                      <Text style={styles.cardTitle}>
                        {tierTitleDisplay(GLOBAL_BANKING_PRODUCT.title)}
                      </Text>
                      <Text style={styles.cardDescription}>
                        {GLOBAL_BANKING_PRODUCT.description}
                      </Text>
                    </View>
                    <View style={styles.cardRight}>
                      {getStatusBadge(
                        bankKycStatus || 'rejected',
                      )}
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.card}>
                  <View style={styles.cardInner}>
                    <View style={[styles.cardContent, styles.cardContentWithCta]}>
                      <View style={styles.cardLeft}>
                        <View style={styles.iconContainer}>
                          <ProductGlyph id="global_banking" size={24} color={colors.primary.main} />
                        </View>
                        <Text style={styles.cardTitle}>
                          {tierTitleDisplay(GLOBAL_BANKING_PRODUCT.title)}
                        </Text>
                        <Text style={styles.cardDescription}>
                          {GLOBAL_BANKING_PRODUCT.description}
                          {cutoverPending
                            ? ` Finish the updated check by ${bridgeCutoverDeadlineLabel(userProfile) ?? 'the deadline in your email'} so new bank details stay available.`
                            : ''}
                        </Text>
                      </View>
                      <View style={styles.cardRight}>
                        {loadingKyc ? (
                          <ActivityIndicator size="small" color={colors.primary.main} />
                        ) : (
                          getStatusBadge(bankKycStatus || 'not_started')
                        )}
                      </View>
                    </View>
                    {!loadingKyc ? (
                      <Pressable
                        onPress={async () => {
                          haptics.tap()
                          await handleOpenKYC()
                        }}
                        style={({ pressed }) => [
                          styles.startBadge,
                          pressed && Platform.OS === 'ios' && styles.cardPressed,
                        ]}
                        android_ripple={{ color: 'rgba(0, 122, 204, 0.12)', borderless: false }}
                      >
                        <Text style={styles.startBadgeText}>
                          {cutoverPending || kycStatusLower === 'in_progress' || kycStatusLower === 'pending'
                            ? 'Continue'
                            : 'Start'}
                        </Text>
                        <ChevronRight size={12} color={colors.neutral.white} strokeWidth={2} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              )}

              {showExpressCard ? (
                <View style={styles.card}>
                  {showExpressCta ? (
                    <View style={styles.cardInner}>
                      <View style={[styles.cardContent, styles.cardContentWithCta]}>
                        <View style={styles.cardLeft}>
                          <View style={styles.iconContainer}>
                            <Zap size={24} color={colors.primary.main} strokeWidth={2} />
                          </View>
                          <Text style={styles.cardTitle}>{EXPRESS_DEPOSITS_COPY.title}</Text>
                          <Text style={styles.cardDescription}>
                            {EXPRESS_DEPOSITS_COPY.description}
                          </Text>
                        </View>
                        <View style={styles.cardRight}>{getStatusBadge(expressStatus)}</View>
                      </View>
                      <Pressable
                        onPress={() => {
                          haptics.tap()
                          const peeked = peekExpressOnrampStatus()
                          if (peeked?.publishableKey) {
                            void loadMobileExpressOnramp(peeked.publishableKey, peeked.cryptoCustomerId).catch(
                              () => undefined,
                            )
                          }
                          navigation.navigate('ExpressDepositsSetup' as never)
                        }}
                        style={({ pressed }) => [
                          styles.startBadge,
                          pressed && Platform.OS === 'ios' && styles.cardPressed,
                        ]}
                        android_ripple={{ color: 'rgba(0, 122, 204, 0.12)', borderless: false }}
                      >
                        <Text style={styles.startBadgeText}>{expressCta}</Text>
                        <ChevronRight size={12} color={colors.neutral.white} strokeWidth={2} />
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.cardContent}>
                      <View style={styles.cardLeft}>
                        <View style={styles.iconContainer}>
                          <Zap size={24} color={colors.primary.main} strokeWidth={2} />
                        </View>
                        <Text style={styles.cardTitle}>{EXPRESS_DEPOSITS_COPY.title}</Text>
                        <Text style={styles.cardDescription}>
                          {EXPRESS_DEPOSITS_COPY.description}
                        </Text>
                      </View>
                      <View style={styles.cardRight}>
                        {expressStatus === 'approved' ? (
                          getStatusBadge(expressStatus)
                        ) : (
                          <View style={styles.comingLaterPill}>
                            <Text style={styles.comingLaterPillText}>Coming later</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              ) : null}

              {CONSUMER_VERIFICATION_PRODUCTS.filter((product) => product.id !== 'global_banking').map((product) => (
                <View key={product.id} style={styles.card}>
                  <View style={styles.cardContent}>
                    <View style={styles.cardLeft}>
                      <View style={styles.iconContainer}>
                        <ProductGlyph id={product.id} size={24} color={colors.text.secondary} />
                      </View>
                      <Text style={styles.cardTitle}>{tierTitleDisplay(product.title)}</Text>
                      <Text style={styles.cardDescription}>{product.description}</Text>
                    </View>
                    <View style={styles.cardRight}>
                      <View style={styles.comingLaterPill}>
                        <Text style={styles.comingLaterPillText}>Coming later</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </View>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
      </CenteredWebFlowPage>
      <ExternalLinkModal
        visible={externalLink.isVisible}
        url={externalLink.url}
        title={externalLink.title}
        onClose={externalLink.closeLink}
      />
      <BridgeHostedVerificationModal
        visible={bridgeHosted.isVisible}
        url={bridgeHosted.url}
        title={bridgeHosted.title}
        phase={bridgeHosted.phase}
        onClose={bridgeHosted.close}
        onHostedEvent={bridgeHosted.onHostedEvent}
      />
      <WebAwareModal
        visible={legacyResidenceOpen}
        onRequestClose={() => {
          if (!savingLegacyResidence) setLegacyResidenceOpen(false)
        }}
        keyboardAvoiding
      >
        <View
          style={[
            styles.legacyResidencePanel,
            { paddingBottom: Math.max(insets.bottom, spacing[5]) + spacing[2] },
          ]}
        >
          <View style={styles.legacyResidenceGrabber} />
          <Text style={styles.legacyResidenceTitle}>Country of residence</Text>
          <Text style={styles.legacyResidenceBody}>
            Needed once for eligibility before starting verification.
          </Text>
          <ResidenceCountryField
            value={legacyResidenceCode}
            onChange={setLegacyResidenceCode}
            label=""
            disabled={savingLegacyResidence}
            error={legacyResidenceError}
            containerStyle={styles.legacyResidenceField}
          />
          <GlossyPrimaryButton
            title={savingLegacyResidence ? 'Saving…' : 'Continue'}
            onPress={() => void handleLegacyResidenceContinue()}
            disabled={savingLegacyResidence}
            style={styles.legacyResidenceCta}
          />
        </View>
      </WebAwareModal>
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
  cardContentWithCta: {
    paddingBottom: spacing[8],
  },
  cardLeft: {
    flex: 1,
    marginRight: spacing[4],
    minWidth: 0,
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
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    flexShrink: 0,
    minWidth: 88,
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
  legacyResidencePanel: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
  },
  legacyResidenceGrabber: {
    width: 40,
    height: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.semantic.border,
    alignSelf: 'center',
    marginBottom: spacing[4],
  },
  legacyResidenceTitle: {
    ...textStyles.headlineSmall,
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  legacyResidenceBody: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginBottom: spacing[4],
    lineHeight: 20,
  },
  legacyResidenceField: {
    marginBottom: spacing[3],
  },
  legacyResidenceCta: {
    marginTop: spacing[1],
    marginBottom: spacing[1],
  },
})

export default function AccountVerificationScreen(props: NavigationProps) {
  return <AccountVerificationContent {...props} />
}





