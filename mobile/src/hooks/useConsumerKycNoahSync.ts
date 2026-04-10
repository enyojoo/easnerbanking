import { useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { noahService } from '../lib/noahService'
import { isTier1Complete } from '../lib/compliance'

/**
 * Consumer (individual) KYC: POST `/api/noah/sync-status` with `individual` scope after the user
 * reaches the main app — same idea as business KYB auto-sync (`useBusinessNoahSync`), not only
 * when opening Account Verification.
 *
 * Skips business accounts (org KYB is handled separately). Requires `noah_customer_id` or the
 * API returns 404 (handled quietly in `noahService.syncStatus`).
 */
export function useConsumerKycNoahSync(): void {
  const { userProfile, refreshUserProfile } = useAuth()
  const lastAutoSyncMsRef = useRef(0)

  const role = userProfile?.role ?? userProfile?.profile?.role
  const customerId =
    userProfile?.noah_customer_id ?? userProfile?.profile?.noah_customer_id ?? null

  const shouldSync =
    role !== 'business' &&
    typeof customerId === 'string' &&
    customerId.length > 0 &&
    !isTier1Complete(userProfile)

  useEffect(() => {
    if (!shouldSync || !refreshUserProfile) return

    const now = Date.now()
    const MIN_MS = 90_000
    if (now - lastAutoSyncMsRef.current < MIN_MS) return
    lastAutoSyncMsRef.current = now

    void (async () => {
      try {
        const result = await noahService.syncStatus({ scope: 'individual' })
        if (result.success && result.synced) {
          await refreshUserProfile()
        }
      } catch {
        // Non-blocking; Account Verification / webhooks can still update.
      }
    })()
  }, [shouldSync, refreshUserProfile])

  useEffect(() => {
    if (!shouldSync || !refreshUserProfile) return

    const id = setInterval(() => {
      void (async () => {
        try {
          const result = await noahService.syncStatus({ scope: 'individual' })
          if (result.success && result.synced) {
            await refreshUserProfile()
          }
        } catch {
          // ignore
        }
      })()
    }, 5 * 60 * 1000)

    return () => clearInterval(id)
  }, [shouldSync, refreshUserProfile])
}
