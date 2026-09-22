import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { qk } from '@easner/shared'
import { useAuth } from '../contexts/AuthContext'
import { useScope } from '../query/scope'
import { bridgeService } from '../lib/bridgeService'
import {
  receiveDepositKycStatus,
  shouldUseBridgeConsumerKyc,
  type ReceiveDepositKycStatus,
} from '../lib/bridgeConsumerKyc'

const PULL_MIN_MS = 8_000

/**
 * Receive screens must follow bank KYC (Bridge or Noah). A profile refresh on focus
 * pulls Bridge when verification is still open, so a just-completed web KYC session
 * replaces the "complete identity verification" state without waiting on a stale cache.
 */
export function useReceiveDepositKyc(): {
  kycStatus: ReceiveDepositKycStatus
  verificationComplete: boolean
} {
  const { user, userProfile, refreshUserProfile } = useAuth()
  const queryClient = useQueryClient()
  const { scope } = useScope()
  const [cachedKycStatus, setCachedKycStatus] = useState<ReceiveDepositKycStatus>(null)
  const pullAtRef = useRef(0)
  const profileRef = useRef(userProfile)
  profileRef.current = userProfile
  const refreshRef = useRef(refreshUserProfile)
  refreshRef.current = refreshUserProfile

  const storageKey = useMemo(
    () => (user?.id ? `easner_receive_kyc_status_${user.id}` : null),
    [user?.id],
  )

  const liveKycStatus: ReceiveDepositKycStatus = userProfile
    ? receiveDepositKycStatus(userProfile)
    : null
  const kycStatus = userProfile ? liveKycStatus : cachedKycStatus

  useEffect(() => {
    if (!storageKey) return
    let cancelled = false
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey)
        if (cancelled || !raw) return
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
  }, [storageKey])

  useEffect(() => {
    if (!storageKey) return
    if (liveKycStatus !== 'approved' && liveKycStatus !== 'in_review' && liveKycStatus !== 'rejected') return
    setCachedKycStatus(liveKycStatus)
    void AsyncStorage.setItem(storageKey, JSON.stringify({ status: liveKycStatus })).catch(() => {})
  }, [storageKey, liveKycStatus])

  useFocusEffect(
    useCallback(() => {
      if (kycStatus === 'approved') return
      const now = Date.now()
      if (now - pullAtRef.current < PULL_MIN_MS) return
      pullAtRef.current = now
      void (async () => {
        const profile = profileRef.current
        // Sync before the profile re-read. Bridge approval often lands in Bridge before the
        // in-memory Noah status the receive screen used to trust.
        if (!profile || shouldUseBridgeConsumerKyc(profile)) {
          try {
            const result = await bridgeService.syncStatus()
            if (result.provisioned && scope) {
              void queryClient.invalidateQueries({ queryKey: qk.wallets.root(scope) })
            }
          } catch {
            // A webhook may already have written approval; the profile re-read still applies.
          }
        }
        await refreshRef.current?.()
      })()
    }, [kycStatus, queryClient, scope]),
  )

  return {
    kycStatus,
    verificationComplete: kycStatus === 'approved',
  }
}
