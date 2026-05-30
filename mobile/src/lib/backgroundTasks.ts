import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'
import { apiFetch } from '../query/api-client'
import { getSessionReliable } from './authSession'
import { NOAH_SCOPE_INDIVIDUAL_HEADERS } from './apiClient'

export const BACKGROUND_TASK_IDENTIFIER = 'background-task'

import { isDefinitiveEmptyBalanceResponse } from './wallet-balance-display'
import { BALANCE_SNAPSHOT_KEY_PREFIX } from './wallet-balance-snapshot'

const DASHBOARD_RECENT_TX_CACHE_KEY_PREFIX = 'easner_dashboard_recent_tx_'
const TRANSACTIONS_CACHE_KEY_PREFIX = 'easner_transactions_screen_list_'

type BalanceEnvelope = {
  USD?: string
  EUR?: string
  source?: string
  detail?: string
}

type TransactionsEnvelope = {
  transactions?: Record<string, unknown>[]
}

async function refreshBackgroundSnapshots(): Promise<boolean> {
  const session = await getSessionReliable()
  const userId = session?.user?.id
  if (!userId) return false

  const [balancesResult, transactionsResult] = await Promise.allSettled([
    apiFetch<BalanceEnvelope>('/api/wallets/on-chain-balances', {
      headers: { ...NOAH_SCOPE_INDIVIDUAL_HEADERS },
    }),
    apiFetch<TransactionsEnvelope>('/api/transactions', {
      query: { limit: 50 },
      headers: { ...NOAH_SCOPE_INDIVIDUAL_HEADERS },
    }),
  ])

  const writes: [string, string][] = []
  const now = Date.now()

  if (balancesResult.status === 'fulfilled') {
    const body = balancesResult.value
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

  if (transactionsResult.status === 'fulfilled') {
    const rows = Array.isArray(transactionsResult.value?.transactions)
      ? transactionsResult.value.transactions
      : []

    writes.push([
      `${DASHBOARD_RECENT_TX_CACHE_KEY_PREFIX}${userId}`,
      JSON.stringify({
        at: now,
        rows: rows.slice(0, 5),
      }),
    ])
    writes.push([
      `${TRANSACTIONS_CACHE_KEY_PREFIX}${userId}`,
      JSON.stringify({
        at: now,
        rows: rows.slice(0, 50),
      }),
    ])
  }

  if (writes.length === 0) return false
  await AsyncStorage.multiSet(writes)
  return true
}

if (Platform.OS === 'ios' || Platform.OS === 'android') {
  TaskManager.defineTask(BACKGROUND_TASK_IDENTIFIER, async () => {
    try {
      const now = Date.now()
      console.log(`Got background task call at date: ${new Date(now).toISOString()}`)
      const wroteSnapshots = await refreshBackgroundSnapshots()
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
