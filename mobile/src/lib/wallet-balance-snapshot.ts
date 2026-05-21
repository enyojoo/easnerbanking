import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Scope } from '@easner/shared'

export type WalletBalanceSnapshot = {
  USD: string
  EUR: string
}

export const BALANCE_SNAPSHOT_KEY_PREFIX = 'easner_wallet_balances_snapshot_v1_'

/** Unset until disk hydrate or a wallet API response (avoids flashing $0.00 while loading). */
const EMPTY: WalletBalanceSnapshot = { USD: '', EUR: '' }
const memoryByKey = new Map<string, WalletBalanceSnapshot>()

export function balanceSnapshotStorageKey(scope: Scope): string {
  const id = scope.kind === 'business' ? scope.orgId : scope.userId
  return `${BALANCE_SNAPSHOT_KEY_PREFIX}${id}`
}

export function parseBalanceSnapshot(raw: string | null): WalletBalanceSnapshot | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { USD?: string; EUR?: string }
    const next: WalletBalanceSnapshot = {
      USD: typeof parsed?.USD === 'string' ? parsed.USD : '0',
      EUR: typeof parsed?.EUR === 'string' ? parsed.EUR : '0',
    }
    if (next.USD.trim().length === 0 && next.EUR.trim().length === 0) return null
    return next
  } catch {
    return null
  }
}

export function hasMeaningfulBalanceSnapshot(snapshot: WalletBalanceSnapshot): boolean {
  return snapshot.USD.trim().length > 0 || snapshot.EUR.trim().length > 0
}

export function getMemoryBalanceSnapshot(key: string): WalletBalanceSnapshot | null {
  return memoryByKey.get(key) ?? null
}

export function setMemoryBalanceSnapshot(key: string, snapshot: WalletBalanceSnapshot): void {
  memoryByKey.set(key, snapshot)
}

/** Read disk snapshot into the in-memory cache (foreground / after background task). */
export async function refreshMemoryBalanceSnapshotFromDisk(
  scope: Scope,
): Promise<WalletBalanceSnapshot | null> {
  const key = balanceSnapshotStorageKey(scope)
  const raw = await AsyncStorage.getItem(key)
  const parsed = parseBalanceSnapshot(raw)
  if (parsed) {
    memoryByKey.set(key, parsed)
    return parsed
  }
  return memoryByKey.get(key) ?? null
}

export async function writeBalanceSnapshotToDisk(
  scope: Scope,
  snapshot: WalletBalanceSnapshot,
): Promise<void> {
  const key = balanceSnapshotStorageKey(scope)
  setMemoryBalanceSnapshot(key, snapshot)
  await AsyncStorage.setItem(key, JSON.stringify({ ...snapshot, ts: Date.now() }))
}

export function emptyBalanceSnapshot(): WalletBalanceSnapshot {
  return { ...EMPTY }
}
