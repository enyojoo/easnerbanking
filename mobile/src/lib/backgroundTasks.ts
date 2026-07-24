import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'
import type { PersonalScope } from '@easner/shared'
import { apiFetch } from '../query/api-client'
import { getSessionReliable } from './authSession'
import { NOAH_SCOPE_INDIVIDUAL_HEADERS } from './apiClient'
import { isDefinitiveEmptyBalanceResponse } from './wallet-balance-display'
import { BALANCE_SNAPSHOT_KEY_PREFIX } from './wallet-balance-snapshot'
import { refreshLiveOperationalData } from '../query/refresh-money-feeds'
import { warmPendingPushTransactionDetail } from './pendingPushNavigation'
import { TRANSACTIONS_LEDGER_PAGE_SIZE } from '../hooks/queries/use-transactions'

export const BACKGROUND_TASK_IDENTIFIER = 'background-task'

type BalanceEnvelope = {
  USD?: string
  EUR?: string
  source?: string
  detail?: string
}

async function refreshBackgroundSnapshots(scope: PersonalScope): Promise<boolean> {
  const userId = scope.userId
  if (!userId) return false

  const balancesResult = await Promise.allSettled([
    apiFetch<BalanceEnvelope>('/api/wallets/on-chain-balances', {
      headers: { ...NOAH_SCOPE_INDIVIDUAL_HEADERS },
    }),
    apiFetch<{ transactions?: unknown[] }>('/api/transactions', {
      query: { limit: TRANSACTIONS_LEDGER_PAGE_SIZE },
      headers: { ...NOAH_SCOPE_INDIVIDUAL_HEADERS },
    }),
  ])

  const writes: [string, string][] = []
  const now = Date.now()
  let updated = false

  const balanceSettled = balancesResult[0]
  if (balanceSettled.status === 'fulfilled') {
    const body = balanceSettled.value
    const source = body?.source
    const detail = body?.detail
    const authoritative = Boolean(source && source !== 'none')
    const definitiveEmpty = isDefinitiveEmptyBalanceResponse(source, detail)
    if (authoritative || definitiveEmpty) {
      writes.push([
        `${BALANCE_SNAPSHOT_KEY_PREFIX}${userId}`,
        JSON.stringify({
          USD: String(body?.USD ?? '0'),
          EUR: String(body?.EUR ?? '0'),
          ts: now,
        }),
      ])
    }
  }

  if (writes.length > 0) {
    await AsyncStorage.multiSet(writes)
    updated = true
  }

  await refreshLiveOperationalData(scope).catch(() => undefined)
  await warmPendingPushTransactionDetail(scope).catch(() => undefined)

  return updated || balancesResult[1].status === 'fulfilled'
}

if (Platform.OS === 'ios' || Platform.OS === 'android') {
  TaskManager.defineTask(BACKGROUND_TASK_IDENTIFIER, async () => {
    try {
      const now = Date.now()
      console.log(`Got background task call at date: ${new Date(now).toISOString()}`)
      const session = await getSessionReliable()
      const userId = session?.user?.id
      if (!userId) {
        console.log('Background task skipped — no session')
        return BackgroundTask.BackgroundTaskResult.Success
      }
      const scope: PersonalScope = { kind: 'personal', userId }
      const wroteSnapshots = await refreshBackgroundSnapshots(scope)
      if (!wroteSnapshots) {
        console.log('Background task finished without snapshot updates')
      }
    } catch (error) {
      console.error('Failed to execute the background task:', error)
      return BackgroundTask.BackgroundTaskResult.Failed
    }
    return BackgroundTask.BackgroundTaskResult.Success
  })
}

export async function registerBackgroundTaskAsync() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return
  return BackgroundTask.registerTaskAsync(BACKGROUND_TASK_IDENTIFIER, {
    minimumInterval: 12 * 60,
  })
}

export async function unregisterBackgroundTaskAsync() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return
  return BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK_IDENTIFIER)
}

/** Dev / debug only — no-op outside `__DEV__` or on web. */
export async function triggerBackgroundTaskWorkerForTestingAsync() {
  if (!__DEV__) return
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return
  await BackgroundTask.triggerTaskWorkerForTestingAsync()
}
