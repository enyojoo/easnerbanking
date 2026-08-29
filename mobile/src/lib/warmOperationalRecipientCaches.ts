import type { QueryClient } from '@tanstack/react-query'
import { qk, type PersonalScope } from '@easner/shared'
import { prefetchRecipientsList } from '../hooks/queries/use-recipients'
import { peekProfileSnapshot, readProfileSnapshot } from './profileSnapshot'
import { warmSendRateCachesFromRecipients } from './warmSendRateCaches'
import { resolveMobilePayInProvider } from './resolveMobilePayInProvider'
import {
  ensureYcLocalDepositCachesReady,
  resolveWarmYcLocalDepositCorridor,
} from './warmYcLocalDepositCaches'
import type { Recipient } from '../types'

export type WarmOperationalRecipientProfile = {
  residence_country?: string | null
  noah_kyc_status?: string | null
}

export type WarmOperationalRecipientCachesOpts = {
  /** Live auth profile when available (login warm); falls back to disk snapshot. */
  profile?: WarmOperationalRecipientProfile | null
}

/**
 * Warm recipient-adjacent operational data after login, foreground resume, or background task.
 * Uses explicit prefetches so updates land even when no screen is mounted (iOS/Android BG).
 */
export async function warmOperationalRecipientCaches(
  qc: QueryClient,
  scope: PersonalScope,
  opts?: WarmOperationalRecipientCachesOpts,
): Promise<void> {
  await qc
    .invalidateQueries({ queryKey: qk.beneficiaries.root(scope), refetchType: 'all' })
    .catch(() => undefined)

  await prefetchRecipientsList(qc, scope).catch(() => undefined)

  const recipients =
    qc.getQueryData<Recipient[]>(qk.beneficiaries.list(scope)) ?? []
  await warmSendRateCachesFromRecipients(qc, recipients).catch(() => undefined)

  const profile =
    opts?.profile ??
    peekProfileSnapshot(scope.userId) ??
    (await readProfileSnapshot(scope.userId).catch(() => null))
  const corridor = resolveWarmYcLocalDepositCorridor(profile)
  if (!corridor) return

  const payInProvider = resolveMobilePayInProvider({
    countryCode: corridor.residenceCountry ?? '',
    currencyCode: corridor.localPayInCurrency ?? '',
  })
  await ensureYcLocalDepositCachesReady({ ...corridor, payInProvider }).catch(() => undefined)
}
