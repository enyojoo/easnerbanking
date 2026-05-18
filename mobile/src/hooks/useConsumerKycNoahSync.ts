import { useEffect, useRef, useCallback } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import { useAuth } from '../contexts/AuthContext'
import { noahService } from '../lib/noahService'
import { isTier1Complete } from '../lib/compliance'

/**
 * Consumer (individual) KYC: POST `/api/noah/sync-status` with `individual` scope after the user
 * reaches the main app — same idea as business KYB auto-sync (`useBusinessNoahSync`).
 *
 * The backend resolves Noah customer id as `users.noah_customer_id` or deterministic `eind_{userId}`,
 * so we **must not** require a stored `noah_customer_id` row for sync to run (Noah may approve
 * before Easner stores the id).
 */
export function useConsumerKycNoahSync(): void {
  const { user, userProfile, refreshUserProfile } = useAuth()
  const lastAutoSyncMsRef = useRef(0)

  const role = userProfile?.role ?? userProfile?.profile?.role

  const shouldSync =
    !!user?.id &&
    role !== 'business' &&
    !isTier1Complete(userProfile)

  const runSync = useCallback(async () => {
    if (!shouldSync || !refreshUserProfile) return
    const now = Date.now()
    const MIN_MS = 15_000
    if (now - lastAutoSyncMsRef.current < MIN_MS) return
    lastAutoSyncMsRef.current = now

    try {
      const result = await noahService.syncStatus({ scope: 'individual' })
      if (result.success && result.synced) {
        await refreshUserProfile()
      }
    } catch {
      // Non-blocking; Account Verification / webhooks can still update.
    }
  }, [shouldSync, refreshUserProfile])

  useEffect(() => {
    void runSync()
  }, [runSync])

  useEffect(() => {
    if (!shouldSync) return

    const id = setInterval(() => {
      void runSync()
    }, 5 * 60 * 1000)

    return () => clearInterval(id)
  }, [shouldSync, runSync])

  /** Same as business: pull Noah when returning to the app (approvals often land while away). */
  useEffect(() => {
    if (!shouldSync) return

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void runSync()
    })
    return () => sub.remove()
  }, [shouldSync, runSync])
}
