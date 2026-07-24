import AsyncStorage from '@react-native-async-storage/async-storage'
import type { NavigationContainerRef } from '@react-navigation/native'
import {
  parsePushTransactionSnapshot,
  pushTransactionDetailAliasIds,
  type PersonalScope,
  type PushTransactionSnapshotRow,
} from '@easner/shared'
import { warmTransactionDetailForNavigation } from '../hooks/queries/use-transactions'
import { prepareTransactionDetailsNavigation } from '../navigation/transactionNavParams'
import { getMobileQueryClient } from '../query/client'
import { getSessionReliable } from './authSession'

const STORAGE_KEY = '@easner_pending_push_nav_v1'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export type PendingPushPayload =
  | {
      at: number
      screen: 'TransactionDetails'
      transactionId: string
      initialTransaction?: PushTransactionSnapshotRow
    }
  | { at: number; screen: 'TransactionCard' }
  | { at: number; screen: 'InAppNotifications' }

export function setPushNavMainReady(ready: boolean): void {
  ;(global as any).easnerPushNavReady = ready
}

function isPushNavMainReady(): boolean {
  return Boolean((global as any).easnerPushNavReady)
}

function parsePushData(data: Record<string, unknown> | undefined): PendingPushPayload | null {
  if (!data || typeof data !== 'object') return null
  const now = Date.now()
  const transactionId = String(data.transactionId ?? data.transaction_id ?? '').trim()
  if (transactionId) {
    const initialTransaction = parsePushTransactionSnapshot(data) ?? undefined
    return {
      at: now,
      screen: 'TransactionDetails',
      transactionId,
      initialTransaction,
    }
  }
  if (data.type === 'card_transaction') {
    return { at: now, screen: 'TransactionCard' }
  }
  return { at: now, screen: 'InAppNotifications' }
}

export async function stashPendingPushFromNotificationData(
  data: Record<string, unknown> | undefined,
): Promise<void> {
  const pending = parsePushData(data)
  if (!pending) return
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pending))
  } catch (e) {
    console.warn('stashPendingPushFromNotificationData:', e)
  }
}

async function loadPending(): Promise<PendingPushPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingPushPayload
    if (!parsed?.screen || typeof parsed.at !== 'number') return null
    if (Date.now() - parsed.at > MAX_AGE_MS) {
      await AsyncStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/** Read pending push without clearing — used for PIN-screen prefetch. */
export async function peekPendingPushPayload(): Promise<PendingPushPayload | null> {
  return loadPending()
}

async function clearPending(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function buildScope(userId: string): PersonalScope {
  return { kind: 'personal', userId: userId.trim() }
}

/** Warm detail cache for a pending TransactionDetails push (best-effort). */
export async function warmPendingPushTransactionDetail(
  scope: PersonalScope,
  data?: Record<string, unknown>,
): Promise<void> {
  const pending = await loadPending()
  if (!pending || pending.screen !== 'TransactionDetails') return

  const aliasIds = data ? pushTransactionDetailAliasIds(data) : []
  const ledgerId =
    pending.initialTransaction?.ledger_row_id?.trim() ||
    pending.transactionId.trim()

  await warmTransactionDetailForNavigation(getMobileQueryClient(), scope, ledgerId, {
    aliasIds: aliasIds.length ? aliasIds : pushTransactionDetailAliasIds({
      transactionId: pending.transactionId,
      easnerTransactionId: pending.initialTransaction?.transaction_id,
    }),
    pushSnapshot: pending.initialTransaction ?? parsePushTransactionSnapshot(data ?? {}) ?? undefined,
  })
}

/**
 * Navigate from a pending push tap once `MainStack` is active (PIN unlocked).
 * Safe to call anytime; no-ops when the user is still on PIN / auth / MFA.
 */
export function flushPendingPushNavigation(
  navigationRef: NavigationContainerRef<unknown> | null | undefined,
  scope?: PersonalScope | null,
): void {
  if (!isPushNavMainReady()) return
  if (!navigationRef?.isReady()) return

  void (async () => {
    const pending = await loadPending()
    if (!pending) return

    try {
      switch (pending.screen) {
        case 'TransactionDetails': {
          const ledgerId =
            pending.initialTransaction?.ledger_row_id?.trim() ||
            pending.transactionId.trim()
          if (scope) {
            await warmTransactionDetailForNavigation(
              getMobileQueryClient(),
              scope,
              ledgerId,
              {
                aliasIds: pushTransactionDetailAliasIds({
                  transactionId: pending.transactionId,
                  easnerTransactionId: pending.initialTransaction?.transaction_id,
                }),
                pushSnapshot: pending.initialTransaction,
              },
            )
          }
          navigationRef.navigate(
            'TransactionDetails' as never,
            prepareTransactionDetailsNavigation({
              transactionId: ledgerId,
              fromScreen: 'PushNotification',
              initialTransaction: pending.initialTransaction,
            }) as never,
          )
          break
        }
        case 'TransactionCard':
          navigationRef.navigate('TransactionCard' as never, {} as never)
          break
        case 'InAppNotifications':
          navigationRef.navigate('InAppNotifications' as never, {} as never)
          break
        default:
          break
      }
      await clearPending()
    } catch (e) {
      console.warn('flushPendingPushNavigation:', e)
    }
  })()
}

import { Platform } from 'react-native'

/** Cold start / resume: Expo may not emit the response listener for the tap that launched the app. */
export async function bootstrapPushNotificationDeepLink(
  scope?: PersonalScope | null,
): Promise<void> {
  if (Platform.OS === 'web') return
  const response = await pushNotificationService.getLastNotificationResponse()
  if (!response?.notification) return
  const data = response.notification.request.content.data as Record<string, unknown> | undefined
  await stashPendingPushFromNotificationData(data)

  let effectiveScope = scope ?? null
  if (!effectiveScope) {
    const session = await getSessionReliable()
    if (session?.user?.id) {
      effectiveScope = buildScope(session.user.id)
    }
  }
  if (effectiveScope) {
    void warmPendingPushTransactionDetail(effectiveScope, data)
  }
  flushPendingPushNavigation(
    (global as any).rootNavigationRef?.current as NavigationContainerRef<unknown> | null,
    effectiveScope,
  )
}
