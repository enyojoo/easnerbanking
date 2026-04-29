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
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { useFocusEffect } from '@react-navigation/native'
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
import { useToast } from '../../components/ToastProvider'

/**
 * Consumer Noah flow: hosted KYC is enough; do not fetch standalone Noah TOS links
 * (errors like "customer exists already" and extra WebView steps).
 */
const SKIP_NOAH_STANDALONE_TOS = true

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
  const insets = useSafeAreaInsets()
  const { showInfo, showError, showSuccess, showWarning } = useToast()

  // TOS state
  const [tosLink, setTosLink] = useState<string | null>(null)
  const [tosLinkId, setTosLinkId] = useState<string | null>(null)
  const [tosSigned, setTosSigned] = useState(false)
  const [tosSignedAgreementId, setTosSignedAgreementId] = useState<string | null>(null)
  const [showTosModal, setShowTosModal] = useState(false)
  const [loadingTos, setLoadingTos] = useState(false)
  const [creatingCustomer, setCreatingCustomer] = useState(false)
  const [customerError, setCustomerError] = useState<string | null>(null)
  
  // Ref to track if we've already processed TOS acceptance via postMessage
  const tosProcessedRef = useRef(false)
  // Ref to prevent duplicate loadTOSStatus calls
  const loadingTosStatusRef = useRef(false)
  // Ref to prevent multiple simultaneous Noah / verification status fetches
  const fetchingNoahStatusRef = useRef(false)
  // Ref to track the last noah_signed_agreement_id we processed
  const lastProcessedTosAgreementIdRef = useRef<string | null>(null)
  // Ref to track periodic sync interval
  const syncIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref to prevent multiple simultaneous syncs
  const syncingRef = useRef(false)

  // KYC Link state
  const [kycLink, setKycLink] = useState<string | null>(null)
  const [kycTosLink, setKycTosLink] = useState<string | null>(null)
  const [kycLinkId, setKycLinkId] = useState<string | null>(null)
  const [kycStatus, setKycStatus] = useState<string | null>(null)
  const [tosStatus, setTosStatus] = useState<string | null>(null)
  const [showKycModal, setShowKycModal] = useState(false)
  const [loadingKyc, setLoadingKyc] = useState(false)
  const [currentKycFlow, setCurrentKycFlow] = useState<'kyc' | 'tos'>('kyc')
  const [kycCompleted, setKycCompleted] = useState(false)
  const [tosCompleted, setTosCompleted] = useState(false)
  const kycProcessedRef = useRef(false)
  const externalLink = useExternalLink()

  // Animation refs
  const headerAnim = useRef(new Animated.Value(0)).current
  const contentAnim = useRef(new Animated.Value(0)).current

  useCalmParallelEnterWhen(true, headerAnim, contentAnim)

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
      /** Always pull Noah until Easner shows approved (not_started / pending must still sync). */
      const shouldSyncByStatus = kycNorm !== 'approved'

      if (!shouldSyncByStatus && !force) {
        if (!silent) {
          console.log('[SYNC-STATUS] Status is approved, skipping sync')
        }
        return
      }

      // Throttle only for in-review / rejected polling — never block not_started → approved (sandbox).
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
            `[SYNC-STATUS] No Noah customer in this environment yet (wrong API key/sandbox or ID mismatch).${tried}`,
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
    refreshUserProfile,
  ])

  // Force Noah pull when opening this screen (success path calls refreshUserProfile — avoid double-fetch).
  useFocusEffect(
    React.useCallback(() => {
      if (!userProfile?.id) return
      void syncNoahStatus(false, true)
    }, [userProfile?.id, syncNoahStatus]),
  )

  useEffect(() => {
    if (!SKIP_NOAH_STANDALONE_TOS) return
    setTosSigned(true)
    setTosCompleted(true)
  }, [])

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
  
  // TOS should appear when KYC is approved
  const bothSubmitted = noahKycApproved

  // Load TOS status only if noah_signed_agreement_id is empty
  // Database is source of truth - if noah_signed_agreement_id exists, TOS is signed
  useEffect(() => {
    if (SKIP_NOAH_STANDALONE_TOS) return
    if (!bothSubmitted || !userProfile?.email || !userProfile?.id) return

    // Prevent duplicate calls
    if (loadingTosStatusRef.current) {
      return
    }

    // Check if TOS is already signed in database (source of truth)
    const noahSignedAgreementId = userProfile?.noah_signed_agreement_id || userProfile?.profile?.noah_signed_agreement_id
    
    if (noahSignedAgreementId) {
      // Only update state if the agreement ID has changed (avoid unnecessary re-renders)
      if (lastProcessedTosAgreementIdRef.current !== noahSignedAgreementId) {
        lastProcessedTosAgreementIdRef.current = noahSignedAgreementId
        setTosSigned(true)
        setTosSignedAgreementId(noahSignedAgreementId)
        // Update cache to match
        const linkId = userProfile?.noah_customer_id ? `customer-${userProfile.noah_customer_id}` : null
        updateTosStatusInCache(true, noahSignedAgreementId, linkId)
      }
      return
    }

    // Reset the ref if TOS is not signed
    if (lastProcessedTosAgreementIdRef.current !== null) {
      lastProcessedTosAgreementIdRef.current = null
    }

    // Only load TOS status if noah_signed_agreement_id is empty
    // Only load if we haven't already set tosSigned to true (avoid unnecessary fetches)
    if (!tosSigned) {
      loadTOSStatus()
    }
  }, [bothSubmitted, userProfile?.email, userProfile?.id, userProfile?.noah_signed_agreement_id])

  const updateTosStatusInCache = async (signed: boolean, agreementId: string | null = null, linkId: string | null = null) => {
    if (!userProfile?.id) return
    
    try {
      const CACHE_KEY = `easner_tos_status_${userProfile.id}`
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
        tosSigned: signed,
        tosSignedAgreementId: agreementId,
        tosLinkId: linkId || tosLinkId,
        timestamp: Date.now()
      }))
    } catch (error) {
      console.error('Error updating TOS cache:', error)
    }
  }

  const loadTOSStatus = async () => {
    if (SKIP_NOAH_STANDALONE_TOS) return
    if (!userProfile?.email || !userProfile?.id) return
    
    // Prevent duplicate calls
    if (loadingTosStatusRef.current) {
      return
    }
    
    loadingTosStatusRef.current = true
    
    try {
      // First, check cache for immediate UI update (like identity/address verification)
      const CACHE_KEY = `easner_tos_status_${userProfile.id}`
      const cached = await AsyncStorage.getItem(CACHE_KEY)
      let cachedData: any = null
      let useCache = false
      
      if (cached) {
        try {
          cachedData = JSON.parse(cached)
          const { tosSigned: cachedTosSigned, tosSignedAgreementId: cachedAgreementId, tosLinkId: cachedTosLinkId, timestamp } = cachedData
          const cacheAge = Date.now() - timestamp
          
          if (cacheAge < 5 * 60 * 1000) { // 5 minute cache
            // Show cached value immediately for instant UI
            setTosSigned(cachedTosSigned)
            if (cachedAgreementId) {
              setTosSignedAgreementId(cachedAgreementId)
            }
            if (cachedTosLinkId) {
              setTosLinkId(cachedTosLinkId)
            }
            
            // If cache is fresh and TOS is signed, use cache and fetch in background silently
            if (cachedTosSigned) {
              useCache = true
              // Fetch fresh data in background (silently, no logs)
              fetchTOSStatusFromDatabase(true)
              loadingTosStatusRef.current = false
              return
            }
            // If TOS is not signed, continue to check database for updates
          } else {
            // Cache expired, clear it
            await AsyncStorage.removeItem(CACHE_KEY)
          }
        } catch (e) {
          console.warn('[TOS-LOAD] Error parsing cache, clearing...', e)
          await AsyncStorage.removeItem(CACHE_KEY)
        }
      }
      
      // Cache is expired or TOS is not signed - fetch from database
      await fetchTOSStatusFromDatabase(false)
    } catch (error: any) {
      console.error('[TOS-LOAD] Error loading TOS status:', error)
      setTosSigned(false)
    } finally {
      loadingTosStatusRef.current = false
    }
  }

  const fetchTOSStatusFromDatabase = async (silent: boolean = false) => {
    if (SKIP_NOAH_STANDALONE_TOS) return
    if (!userProfile?.id) return
    
    try {
      // Check database for persistent TOS status (source of truth)
      const { data: userData, error: dbError } = await supabase
        .from('users')
        .select('noah_customer_id, noah_signed_agreement_id')
        .eq('id', userProfile.id)
        .single()
      
      if (dbError) {
        if (!silent) {
          console.error('[TOS-LOAD] Error fetching from database:', dbError)
        }
        return
      }
      
      // If we have signed_agreement_id in database, TOS is signed - stop here
      if (userData?.noah_signed_agreement_id) {
        if (!silent) {
          console.log('[TOS-LOAD] ✅ TOS signed (from database) - updating state')
        }
        setTosSigned(true)
        setTosSignedAgreementId(userData.noah_signed_agreement_id)
        
        // Set tosLinkId for consistency
        const linkId = userData.noah_customer_id ? `customer-${userData.noah_customer_id}` : null
        if (linkId) {
          setTosLinkId(linkId)
        }
        
        // Update cache with database value (ensures cache matches database)
        await updateTosStatusInCache(true, userData.noah_signed_agreement_id, linkId)
        
        // Don't fetch TOS link from verification API - not needed if already signed
        return
      }
      
      // If database says TOS is NOT signed, update state to false
      if (userData && !userData.noah_signed_agreement_id) {
        if (!silent) {
          console.log('[TOS-LOAD] ❌ TOS not signed (from database) - updating state')
        }
        setTosSigned(false)
        setTosSignedAgreementId(null)
        // Update cache to match database
        await updateTosStatusInCache(false, null, null)
      }
      
      // Only fetch from verification API if noah_signed_agreement_id is empty
      // This should be rare — only if the host requires TOS again
      // First try to get TOS link (for cases where customer doesn't exist yet or needs new TOS)
      try {
        const response = await noahService.getTOSLink(userProfile.email!, 'individual')
        const link = response.tosLink
        const linkId = response.tosLinkId
        
        if (link && link.trim() !== '') {
          setTosLink(link)
          setTosLinkId(linkId)
          
          // Only check verification API status if we have a customer_id (to avoid unnecessary calls)
          if (userData?.noah_customer_id && linkId) {
            try {
              const status = await noahService.checkTOSStatus(linkId)
              if (status.signed) {
                setTosSigned(true)
                setTosSignedAgreementId(status.signedAgreementId || null)
                
                // Update cache
                await updateTosStatusInCache(true, status.signedAgreementId || null, linkId)
                
                // Store in database for persistence
                if (status.signedAgreementId) {
                  await storeSignedAgreementId(status.signedAgreementId)
                }
              } else {
                setTosSigned(false)
                await updateTosStatusInCache(false, null, linkId)
              }
            } catch (statusError: any) {
              // If status check fails, just set TOS as not signed
              // The link is available for the user to sign
              setTosSigned(false)
              if (!silent) {
                console.warn('[TOS-LOAD] Could not check TOS status from Noah:', statusError.message)
              }
            }
          }
        } else if ((response as any).alreadyAccepted) {
          // Provider says TOS is already accepted but we don't have it in database
          // This shouldn't happen, but handle it gracefully
          setTosSigned(true)
          setTosLinkId(linkId)
          await updateTosStatusInCache(true, null, linkId)
        } else {
          setTosSigned(false)
          if (linkId) {
            await updateTosStatusInCache(false, null, linkId)
          }
        }
      } catch (tosLinkError: any) {
        // If TOS link creation fails, log but don't fail completely
        if (!silent) {
          console.warn('[TOS-LOAD] Could not get TOS link:', tosLinkError.message)
        }
        // Don't set tosSigned to false here - database is source of truth
      }
    } catch (error: any) {
      if (!silent) {
        console.error('[TOS-LOAD] Error fetching TOS status from database:', error)
      }
    }
  }
  
  const storeSignedAgreementId = async (signedAgreementId: string) => {
    if (!userProfile?.id) return
    
    try {
      const { error } = await supabase
        .from('users')
        .update({ noah_signed_agreement_id: signedAgreementId })
        .eq('id', userProfile?.id)
      
      if (error) {
        console.error('Error storing signed_agreement_id:', error)
      } else {
        console.log('Stored signed_agreement_id in database:', signedAgreementId)
        
        // Immediately update UI state (don't wait for cache)
        setTosSigned(true)
        setTosSignedAgreementId(signedAgreementId)
        
        // Update cache to keep it in sync
        await updateTosStatusInCache(true, signedAgreementId, tosLinkId)
        
        // Force refresh TOS status to ensure everything is in sync
        // Use a small delay to ensure database write is complete
        setTimeout(() => {
          if (bothSubmitted && userProfile?.email) {
            loadingTosStatusRef.current = false // Reset ref to allow refresh
            loadTOSStatus()
          }
        }, 500)
      }
    } catch (error) {
      console.error('Error storing signed_agreement_id:', error)
    }
  }

  const handleOpenTOS = async () => {
    if (SKIP_NOAH_STANDALONE_TOS) return
    if (!userProfile?.email) return
    
    // FIRST: Check if TOS is already signed - if so, don't try to create a new link
    if (tosSigned || userProfile.noah_signed_agreement_id) {
      console.log('[TOS-OPEN] TOS already signed, skipping link generation')
      showInfo('You have already accepted the partner terms of service.')
      return
    }
    
    // Reset the processed flag when opening TOS modal
    tosProcessedRef.current = false
    console.log('[TOS-OPEN] Opening TOS modal, reset processed flag')
    
    setLoadingTos(true)
    try {
      if (!tosLink || !tosLinkId) {
        // Before trying to create TOS link, check database one more time
        const { data: userData } = await supabase
          .from('users')
          .select('noah_signed_agreement_id, noah_customer_id')
          .eq('id', userProfile.id)
          .single()
        
        // If TOS is already signed, don't try to create a link
        if (userData?.noah_signed_agreement_id) {
          console.log('[TOS-OPEN] TOS already signed in database, skipping link generation')
          setTosSigned(true)
          setTosSignedAgreementId(userData.noah_signed_agreement_id)
          setLoadingTos(false)
          showInfo('You have already accepted the partner terms of service.')
          return
        }
        
        // If customer exists, try to get TOS link from customer object first (avoids 401)
        if (userData?.noah_customer_id) {
          try {
            const customer = await noahService.getCustomer(userData.noah_customer_id)
            const customerTosLink = (customer as any).tos_link
            const hasAcceptedTOS = (customer as any).has_accepted_terms_of_service === true
            
            if (hasAcceptedTOS) {
              console.log('[TOS-OPEN] Customer already accepted TOS')
              setTosSigned(true)
              setLoadingTos(false)
              showInfo('You have already accepted the partner terms of service.')
              return
            }
            
            if (customerTosLink) {
              console.log('[TOS-OPEN] Using TOS link from customer object')
              setTosLink(customerTosLink)
              setTosLinkId(`customer-${userData.noah_customer_id}`)
              await externalLink.openLink(customerTosLink, 'Partner Terms of Service')
              setLoadingTos(false)
              return
            }
          } catch (customerError: any) {
            console.warn('[TOS-OPEN] Could not get customer TOS link:', customerError.message)
            // Fall through to try creating new TOS link
          }
        }
        
        // Last resort: Try to create new TOS link (this is where 401 happens)
        console.log('[TOS-OPEN] Attempting to create new TOS link...')
        try {
        const response = await noahService.getTOSLink(userProfile.email, 'individual')
        const link = response.tosLink
        const linkId = response.tosLinkId
        
        setTosLink(link)
        setTosLinkId(linkId)
        
        if (!link) {
          showError('Unable to load Terms of Service. Please try again or contact support.')
          setLoadingTos(false)
          return
        }
        
        await externalLink.openLink(link, 'Partner Terms of Service')
        } catch (tosLinkError: any) {
          // If TOS link creation fails (especially 401), check if TOS is already accepted
          console.warn('[TOS-OPEN] TOS link creation failed:', tosLinkError.message)
          
          // If it's a 401 error, it might mean TOS is already accepted or API key doesn't have permission
          // Check customer status one more time
          if (userData?.noah_customer_id) {
            try {
              const customer = await noahService.getCustomer(userData.noah_customer_id)
              const hasAcceptedTOS = (customer as any).has_accepted_terms_of_service === true
              
              if (hasAcceptedTOS) {
                console.log('[TOS-OPEN] Customer already has TOS accepted (checked after 401 error)')
                setTosSigned(true)
                setLoadingTos(false)
                showInfo('You have already accepted the partner terms of service.')
                return
              }
            } catch (customerCheckError: any) {
              console.warn('[TOS-OPEN] Could not verify customer TOS status:', customerCheckError.message)
            }
          }
          
          // If we can't verify TOS status, show a helpful error
          // But first, check database one more time to be absolutely sure
          try {
            const { data: finalCheck } = await supabase
            .from('users')
            .select('noah_signed_agreement_id')
              .eq('id', userProfile.id)
            .single()
          
            if (finalCheck?.noah_signed_agreement_id) {
              console.log('[TOS-OPEN] TOS confirmed signed in database after 401 error')
            setTosSigned(true)
              setTosSignedAgreementId(finalCheck.noah_signed_agreement_id)
            setLoadingTos(false)
              showInfo('You have already accepted the partner terms of service.')
            return
          }
          } catch (dbError: any) {
            console.warn('[TOS-OPEN] Could not verify TOS in database:', dbError.message)
          }
          
          // If we still can't confirm TOS is accepted, show error
          const errorMessage = tosLinkError.message || 'Failed to load terms of service'
          if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
            showWarning(
              'Unable to create Terms of Service link. This may be because TOS is already accepted or there is a temporary API permission issue.',
            )
          } else {
            showError(
              `Unable to load Terms of Service: ${errorMessage}. If TOS is already accepted, you can ignore this.`,
            )
          }
          setLoadingTos(false)
          return
        }
      } else {
        // We have tosLink and tosLinkId - just open the modal
        // Don't check database here - state is managed by loadTOSStatus
        if (!tosLink) {
          showError('Terms of Service link is not available. Please try again or contact support.')
          setLoadingTos(false)
          return
        }
        await externalLink.openLink(tosLink, 'Partner Terms of Service')
      }
    } catch (error: any) {
      console.error('Error opening TOS:', error)
      const errorMessage = error.message || 'Failed to load terms of service'
      showError(`${errorMessage}\n\nPlease try again or contact support if the issue persists.`)
      // Don't update state on error - let loadTOSStatus handle state management
    } finally {
      setLoadingTos(false)
    }
  }

  const handleTOSModalClose = () => {
    setShowTosModal(false)
    
    // If we already processed TOS via postMessage, no need to check again
    if (tosProcessedRef.current) {
      console.log('[TOS-MODAL] Modal closed but TOS already processed via postMessage')
      return
    }
    
    // If postMessage didn't fire, rely on webhooks and sync-status
    // Status will be updated when user refreshes or reopens the screen
    console.log('[TOS-MODAL] Modal closed. TOS status will be synced via webhooks or next screen load.')
    if (refreshUserProfile && userProfile?.id) {
      void refreshUserProfile()
    }
  }

  const handleOpenKYC = async () => {
    if (!userProfile?.email) {
      showWarning('Please complete your profile information before starting KYC verification.')
      return
    }
    
    setLoadingKyc(true)
    kycProcessedRef.current = false
    setCurrentKycFlow('kyc')
    setKycCompleted(false)
    setTosCompleted(SKIP_NOAH_STANDALONE_TOS)
    
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
                tos_link: null,
                kyc_link_id: `customer-${userProfile.noah_customer_id}`,
                kyc_status: userProfile.noah_kyc_status || 'not_started',
                tos_status: 'pending',
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
      setKycTosLink(response.tos_link || null)
      setKycLinkId(response.kyc_link_id || null)
      setKycStatus(response.kyc_status || 'not_started')
      setTosStatus(response.tos_status || 'pending')
      
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
        showError('Unable to load KYC verification. Please try again or contact support.')
        setLoadingKyc(false)
        return
      }
      
      await externalLink.openLink(buildKycIframeUrl(response.kyc_link), 'Verification for global banking')
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
    
    // If both flows are completed, refresh user profile
    if (kycCompleted && tosCompleted) {
      console.log('[KYC-MODAL] Both KYC and TOS completed, refreshing user profile')
      // Refresh user profile to get updated KYC status
      setTimeout(() => {
        if (refreshUserProfile && userProfile?.id) {
          void refreshUserProfile()
        }
      }, 2000)
      return
    }
    if (refreshUserProfile && userProfile?.id) {
      void refreshUserProfile()
    }
  }

  const buildKycIframeUrl = (link: string): string => {
    // Replace /verify with /widget and add iframe-origin parameter
    const widgetUrl = link.replace('/verify', '/widget')
    // Use the API base URL as the origin (for React Native, we use the API URL)
    const origin = getApiBaseUrl()
    // Check if URL already has query parameters
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

  const scrollBottomPad = Math.max(insets.bottom, spacing[4]) + spacing[5]

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
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
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
                                    if (typeof reasonObj === 'object' && reasonObj !== null && reasonObj.reason) {
                                      const reason = String(reasonObj.reason).trim()
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
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
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

            {/* TOS WebView Modal */}
            <Modal
              visible={showTosModal}
              animationType="slide"
              presentationStyle="pageSheet"
              onRequestClose={handleTOSModalClose}
            >
              <View style={styles.modalContainer}>
                <IframeWebViewModalHeader onClose={handleTOSModalClose} title="Partner Terms of Service" />
                {tosLink && (
                  <WebView
                    source={{ uri: tosLink }}
                    style={styles.webView}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    onShouldStartLoadWithRequest={(request) => {
                      // Suppress warnings for about:srcdoc (used by iframes with inline HTML)
                      if (request.url === 'about:srcdoc') {
                        return false
                      }
                      // Allow navigation to proceed
                      return true
                    }}
                    onError={(syntheticEvent) => {
                      const { nativeEvent } = syntheticEvent
                      // Suppress harmless about:srcdoc warnings
                      if (nativeEvent.url === 'about:srcdoc') {
                        return
                      }
                      console.warn('[TOS-WEBVIEW] WebView error:', nativeEvent)
                    }}
                    onHttpError={(syntheticEvent) => {
                      const { nativeEvent } = syntheticEvent
                      console.warn('[TOS-WEBVIEW] HTTP error:', nativeEvent.statusCode, nativeEvent.url)
                    }}
                    onNavigationStateChange={(navState) => {
                      // Check if user navigated away (might indicate acceptance)
                      // Hosted TOS pages typically redirect after acceptance
                      console.log('[TOS-WEBVIEW] Navigation changed:', {
                        url: navState.url,
                        originalUrl: tosLink,
                        loading: navState.loading,
                        canGoBack: navState.canGoBack
                      })
                      
                      // If URL changed and page finished loading, user might have accepted TOS
                      if (navState.url !== tosLink && !navState.loading) {
                        console.log('[TOS-WEBVIEW] URL changed - user may have accepted TOS, will start polling when modal closes')
                        // Don't start polling here - wait for modal to close
                        // The handleTOSModalClose will start polling
                      }
                    }}
                    onMessage={async (event) => {
                      // Handle messages from WebView if the host sends any
                      console.log('[TOS-WEBVIEW] 📨 Message received from WebView:', {
                        data: event.nativeEvent.data,
                        type: typeof event.nativeEvent.data,
                        alreadyProcessed: tosProcessedRef.current
                      })
                      
                      // Prevent duplicate processing
                      if (tosProcessedRef.current) {
                        console.log('[TOS-WEBVIEW] ⚠️ Message already processed, ignoring')
                        return
                      }
                      
                      try {
                        const messageData = event.nativeEvent.data
                        let data: any
                        
                        // Try to parse as JSON
                        if (typeof messageData === 'string') {
                          data = JSON.parse(messageData)
                        } else {
                          data = messageData
                        }
                        
                        console.log('[TOS-WEBVIEW] 📋 Parsed message data:', data)
                        
                        if (data && data.signedAgreementId) {
                          const signedAgreementId = data.signedAgreementId
                          console.log(`[TOS-WEBVIEW] ✅ Received signedAgreementId from WebView: ${signedAgreementId.substring(0, 8)}...`)
                          
                          // Mark as processed to prevent duplicate handling
                          tosProcessedRef.current = true
                          
                          // Store signed_agreement_id first
                          await storeSignedAgreementId(signedAgreementId)
                          
                          // Update UI immediately
                          setTosSigned(true)
                          setTosSignedAgreementId(signedAgreementId)
                          
                          // Update cache immediately
                          await updateTosStatusInCache(true, signedAgreementId, tosLinkId)
                          
                          console.log(`[TOS-WEBVIEW] ✅ TOS signed_agreement_id stored in database`)
                          
                          // Check if Noah customer exists before trying to update
                          const { data: userData } = await supabase
                            .from('users')
                            .select('noah_customer_id')
                            .eq('id', userProfile?.id)
                            .single()
                          
                          if (userData?.noah_customer_id) {
                            // Customer exists - update it with signed_agreement_id
                            try {
                              console.log(`[TOS-WEBVIEW] 🔄 Customer exists, updating with signed_agreement_id: ${signedAgreementId.substring(0, 8)}...`)
                              const updateResult = await noahService.updateCustomerTOS(signedAgreementId)
                              console.log(`[TOS-WEBVIEW] ✅ Customer updated successfully. Response:`, {
                                success: updateResult.success,
                                hasAcceptedTOS: updateResult.hasAcceptedTOS,
                                customerId: updateResult.customerId
                              })
                              
                              showSuccess(
                                'Your Terms of Service have been accepted. You can now create your accounts.',
                                4000,
                              )
                              setShowTosModal(false)
                              return
                            } catch (updateError: any) {
                              console.error(`[TOS-WEBVIEW] ⚠️ Error updating customer TOS (customer exists):`, updateError.message)
                              showWarning(
                                'Terms accepted. There was an issue updating your Easner account; this will resolve when your account is set up.',
                                5000,
                              )
                              setShowTosModal(false)
                              return
                            }
                          } else {
                            // Customer doesn't exist yet - this is expected if KYC is still in_review
                            // The admin will create the customer via "Send to Noah" button
                            console.log(`[TOS-WEBVIEW] ℹ️ Customer doesn't exist yet. TOS signed_agreement_id stored. Admin will create customer via "Send to Noah".`)
                            
                            showSuccess(
                              'Terms accepted. Your account will finish setup after identity verification is approved.',
                              4500,
                            )
                            setShowTosModal(false)
                            return
                          }
                        } else {
                          console.log('[TOS-WEBVIEW] ⚠️ Message received but no signedAgreementId found:', data)
                        }
                      } catch (parseError: any) {
                        // Not JSON or parsing failed - that's OK, might be a different message
                        console.log('[TOS-WEBVIEW] ⚠️ Could not parse message as JSON:', {
                          error: parseError.message,
                          data: event.nativeEvent.data
                        })
                      }
                    }}
                  />
                )}
              </View>
            </Modal>

            {/* KYC WebView Modal */}
            <Modal
              visible={showKycModal}
              animationType="slide"
              presentationStyle="pageSheet"
              onRequestClose={handleKycModalClose}
            >
              <View style={styles.modalContainer}>
                <IframeWebViewModalHeader onClose={handleKycModalClose}>
                  {currentKycFlow === 'kyc' ? (
                    <View style={styles.modalKycTitleRow}>
                      <Text style={[iframeModalTitleTextStyle, styles.modalKycTitleText]} numberOfLines={2}>
                        Verification for global banking
                      </Text>
                      <View style={styles.tierPill}>
                        <Text style={styles.tierPillText}>Tier 1</Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={iframeModalTitleTextStyle} numberOfLines={2}>
                      Partner Terms of Service
                    </Text>
                  )}
                </IframeWebViewModalHeader>
                {currentKycFlow === 'kyc' && kycLink && (
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
                          
                          // If TOS link is available, switch to TOS flow (skipped when standalone Noah TOS is disabled)
                          if (
                            kycTosLink &&
                            !tosCompleted &&
                            !SKIP_NOAH_STANDALONE_TOS
                          ) {
                            console.log('[KYC-WEBVIEW] 🔄 Switching to TOS flow')
                            setCurrentKycFlow('tos')
                            kycProcessedRef.current = false // Reset for TOS flow
                          } else {
                            showSuccess('KYC verification completed.', 3500)
                            handleKycModalClose()
                          }
                        }
                        
                        // Handle TOS completion
                        if (data && (data.tosCompleted || data.signedAgreementId)) {
                          console.log('[KYC-WEBVIEW] ✅ TOS completed')
                          kycProcessedRef.current = true
                          setTosCompleted(true)
                          setTosStatus('approved')
                          
                          if (data.signedAgreementId && userProfile?.id) {
                            // Store signed_agreement_id
                            await supabase
                              .from('users')
                              .update({ noah_signed_agreement_id: data.signedAgreementId })
                              .eq('id', userProfile.id)
                          }
                          
                          showSuccess('KYC and Terms of Service completed.', 4000)
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
                )}
                {currentKycFlow === 'tos' && kycTosLink && (
                  <WebView
                    source={{ uri: kycTosLink }}
                    style={styles.webView}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    onMessage={async (event) => {
                      console.log('[KYC-TOS-WEBVIEW] 📨 Message received from WebView:', {
                        data: event.nativeEvent.data,
                      })
                      
                      if (kycProcessedRef.current && tosCompleted) {
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
                        
                        if (data && data.signedAgreementId) {
                          console.log('[KYC-TOS-WEBVIEW] ✅ TOS completed')
                          kycProcessedRef.current = true
                          setTosCompleted(true)
                          setTosStatus('approved')
                          
                          if (userProfile?.id) {
                            await supabase
                              .from('users')
                              .update({ noah_signed_agreement_id: data.signedAgreementId })
                              .eq('id', userProfile.id)
                          }
                          
                          showSuccess('KYC and Terms of Service completed.', 4000)
                          handleKycModalClose()
                        }
                      } catch (error: any) {
                        console.error('[KYC-TOS-WEBVIEW] Error processing message:', error)
                      }
                    }}
                    onNavigationStateChange={(navState) => {
                      console.log('[KYC-TOS-WEBVIEW] Navigation changed:', {
                        url: navState.url,
                        loading: navState.loading,
                      })
                    }}
                  />
                )}
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





