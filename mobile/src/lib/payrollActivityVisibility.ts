import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_PREFIX = 'easner_payroll_activity_visible_v1_'
const visibleUserIds = new Set<string>()

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`
}

/**
 * Payroll is a permanent account capability after the first connection request.
 * Only a positive result is cached: transient API failures or stale negative
 * responses can therefore never make an established Payroll row disappear.
 */
export function peekPayrollActivityVisible(userId: string): boolean {
  return visibleUserIds.has(userId)
}

export async function loadPayrollActivityVisible(userId: string): Promise<boolean> {
  if (visibleUserIds.has(userId)) return true

  try {
    const stored = await AsyncStorage.getItem(storageKey(userId))
    if (stored !== '1') return false
    visibleUserIds.add(userId)
    return true
  } catch {
    return false
  }
}

export async function markPayrollActivityVisible(userId: string): Promise<void> {
  // Update memory before the async write so the row remains stable in this session
  // even when device storage is temporarily unavailable.
  visibleUserIds.add(userId)
  try {
    await AsyncStorage.setItem(storageKey(userId), '1')
  } catch {
    // The server remains authoritative and will restore the positive cache later.
  }
}
