import { useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { noahService } from '../lib/noahService'
import { isTier1Complete } from '../lib/compliance'

/**
 * Mirrors `business/components/compliance/business-verification-section.tsx`:
 * POST `/api/noah/sync-status` with `X-Easner-Noah-Scope: business`, throttled on mount,
 * then every 5 minutes while org Tier 1 (KYB) is not approved.
 */
export function useBusinessNoahSync(): void {
  const { userProfile, refreshUserProfile } = useAuth()
  const lastAutoSyncMsRef = useRef(0)

  const role = userProfile?.role ?? userProfile?.profile?.role
  const businessId =
    userProfile?.easner_business_id ?? userProfile?.profile?.easner_business_id ?? null

  const shouldSync =
    role === 'business' &&
    typeof businessId === 'string' &&
    businessId.length > 0 &&
    !isTier1Complete(userProfile)

  useEffect(() => {
    if (!shouldSync || !refreshUserProfile) return

    const now = Date.now()
    const MIN_MS = 90_000
    if (now - lastAutoSyncMsRef.current < MIN_MS) return
    lastAutoSyncMsRef.current = now

    void (async () => {
      try {
        await noahService.syncStatus({ scope: 'business' })
        await refreshUserProfile()
      } catch {
        // Non-blocking: webhooks may already have updated; retry on interval.
      }
    })()
  }, [shouldSync, refreshUserProfile])

  useEffect(() => {
    if (!shouldSync || !refreshUserProfile) return

    const id = setInterval(() => {
      void (async () => {
        try {
          await noahService.syncStatus({ scope: 'business' })
          await refreshUserProfile()
        } catch {
          // ignore
        }
      })()
    }, 5 * 60 * 1000)

    return () => clearInterval(id)
  }, [shouldSync, refreshUserProfile])
}
