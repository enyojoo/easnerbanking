import { useEffect, useRef, useCallback, useState } from 'react'
import { AppState, AppStateStatus, Platform } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { qk } from '@easner/shared'
import { useAuth } from '../contexts/AuthContext'
import { useDocumentVisibility } from './useDocumentVisibility'
import { noahService } from '../lib/noahService'
import { isTier1Complete } from '../lib/compliance'
import { needsNoahVirtualAccountProvision } from '../lib/noahAccountSync'
import {
  readFiatProvisionResolved,
  writeFiatProvisionResolved,
} from '../lib/noahFiatProvisionResolved'
import { useScope } from '../query/scope'

/**
 * Consumer (individual) KYC: POST `/api/noah/sync-status` with `individual` scope after the user
 * reaches the main app — same idea as business KYB auto-sync (`useBusinessSync`).
 *
 * The backend resolves Noah customer id as `users.noah_customer_id` or deterministic `eind_{userId}`,
 * so we **must not** require a stored `noah_customer_id` row for sync to run (Noah may approve
 * before Easner stores the id).
 */
export function useConsumerKycNoahSync(): void {
  const { user, userProfile, refreshUserProfile } = useAuth()
  const queryClient = useQueryClient()
  const { scope } = useScope()
  const lastAutoSyncMsRef = useRef(0)
  const [fiatProvisionResolved, setFiatProvisionResolved] = useState(false)

  const role = userProfile?.role ?? userProfile?.profile?.role

  useEffect(() => {
    if (!user?.id) {
      setFiatProvisionResolved(false)
      return
    }
    let cancelled = false
    void readFiatProvisionResolved(user.id).then((resolved) => {
      if (!cancelled) setFiatProvisionResolved(resolved)
    })
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const shouldSync =
    !!user?.id &&
    role !== 'business' &&
    (!isTier1Complete(userProfile) ||
      needsNoahVirtualAccountProvision(userProfile, { fiatProvisionResolved }))

  const runSync = useCallback(async () => {
    if (!shouldSync || !refreshUserProfile || !user?.id) return
    const now = Date.now()
    const MIN_MS = 15_000
    if (now - lastAutoSyncMsRef.current < MIN_MS) return
    lastAutoSyncMsRef.current = now

    try {
      const kycApproved =
        isTier1Complete(userProfile) ||
        String(userProfile?.noah_kyc_status ?? '').trim().toLowerCase() === 'approved'
      const result = kycApproved
        ? await noahService.syncStatusUntilAccountsReady({ scope: 'individual' })
        : await noahService.syncStatus({ scope: 'individual' })
      if (result.success && result.synced) {
        if (result.data?.needsFiatAccounts === false || result.accountsReady === true) {
          await writeFiatProvisionResolved(user.id)
          setFiatProvisionResolved(true)
          if (scope) {
            void queryClient.invalidateQueries({ queryKey: qk.wallets.root(scope) })
          }
        }
        await refreshUserProfile()
      }
    } catch {
      // Non-blocking; Account Verification / webhooks can still update.
    }
  }, [shouldSync, refreshUserProfile, user?.id, queryClient, scope])

  useEffect(() => {
    void runSync()
  }, [runSync])

  useEffect(() => {
    if (!shouldSync) return

    const id = setInterval(() => {
      void runSync()
    }, shouldSync && isTier1Complete(userProfile) ? 10_000 : 5 * 60 * 1000)

    return () => clearInterval(id)
  }, [shouldSync, runSync])

  /** Same as business: pull Noah when returning to the app (approvals often land while away). */
  const tabVisible = useDocumentVisibility()

  useEffect(() => {
    if (!shouldSync) return
    if (Platform.OS === 'web') {
      if (!tabVisible) return
      void runSync()
      return
    }

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void runSync()
    })
    return () => sub.remove()
  }, [shouldSync, runSync, tabVisible])
}
