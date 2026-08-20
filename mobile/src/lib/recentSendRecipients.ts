import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Recipient, Transaction } from '../types'

const STORAGE_PREFIX = 'send_last_recipient_touch_'

function txTimestamp(tx: Transaction): number {
  const raw = tx.completed_at || tx.updated_at || tx.created_at
  const t = raw ? new Date(raw).getTime() : 0
  return Number.isFinite(t) ? t : 0
}

/**
 * Build last-send timestamps from ledger rows that include `recipient_id`.
 */
export function lastSentMapFromTransactions(transactions: Transaction[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const tx of transactions) {
    const rid = tx.recipient_id?.trim()
    if (!rid) continue
    if (tx.status !== 'completed') continue
    const ts = txTimestamp(tx)
    if (!ts) continue
    map[rid] = Math.max(map[rid] || 0, ts)
  }
  return map
}

export async function loadStoredLastTouches(userId: string): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_PREFIX + userId)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string>
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(parsed)) {
      const t = new Date(v).getTime()
      if (Number.isFinite(t)) out[k] = t
    }
    return out
  } catch {
    return {}
  }
}

export async function mergeLastSentMaps(
  userId: string,
  transactions: Transaction[],
): Promise<Record<string, number>> {
  const fromTx = lastSentMapFromTransactions(transactions)
  const fromStorage = await loadStoredLastTouches(userId)
  const merged: Record<string, number> = { ...fromStorage }
  for (const [id, ts] of Object.entries(fromTx)) {
    merged[id] = Math.max(merged[id] || 0, ts)
  }
  return merged
}

/** Call after a successful send so ordering works when `recipient_id` is missing on txs. */
export async function recordRecipientSentTouch(userId: string, recipientId: string): Promise<void> {
  const key = STORAGE_PREFIX + userId
  const existing = await loadStoredLastTouches(userId)
  existing[recipientId] = Date.now()
  const serial: Record<string, string> = {}
  for (const [k, v] of Object.entries(existing)) {
    serial[k] = new Date(v).toISOString()
  }
  await AsyncStorage.setItem(key, JSON.stringify(serial))
}

export type SendHubRecipientSort = {
  sorted: Recipient[]
  recentIds: Set<string>
}

export function sortRecipientsForSendHub(
  recipients: Recipient[],
  lastSentAtByRecipient: Record<string, number>,
): SendHubRecipientSort {
  const withTs = recipients.map((r) => ({
    r,
    ts: lastSentAtByRecipient[r.id] || 0,
  }))
  const recent = withTs
    .filter((x) => x.ts > 0)
    .sort((a, b) => b.ts - a.ts)
    .map((x) => x.r)
  const recentIds = new Set(recent.map((r) => r.id))
  const others = withTs
    .filter((x) => x.ts <= 0)
    .sort((a, b) => a.r.full_name.localeCompare(b.r.full_name, undefined, { sensitivity: 'base' }))
    .map((x) => x.r)
  return { sorted: [...recent, ...others], recentIds }
}

/**
 * - No leading `@`: local-only match (saved list) – name, bank, account, IBAN, easetag (with/without `@`).
 * - Leading `@`: Easetag mode – match saved rows by handle / name (prefix-friendly for progressive search).
 */
export function filterRecipientsBySearch(recipients: Recipient[], searchTerm: string): Recipient[] {
  const trimmed = searchTerm.trim()
  if (!trimmed) return recipients

  const isAtMode = trimmed.startsWith('@')
  const handleQuery = isAtMode ? trimmed.replace(/^@+/, '').toLowerCase() : ''
  const q = trimmed.toLowerCase()

  return recipients.filter((r) => {
    if (isAtMode) {
      if (!handleQuery) return true
      const tag = (r.payee_easetag || '').trim().toLowerCase()
      const name = (r.full_name || '').trim().toLowerCase()
      return (
        tag.startsWith(handleQuery) ||
        tag.includes(handleQuery) ||
        name.includes(handleQuery) ||
        (`@${tag}`.includes(handleQuery) && tag.length > 0)
      )
    }

    const hay = [
      r.full_name,
      r.bank_name,
      r.payee_easetag || '',
      r.payee_easetag ? `@${r.payee_easetag}` : '',
      r.account_number,
      r.iban || '',
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}