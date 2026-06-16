import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY_PREFIX = 'easner_noah_fiat_resolved_'

export function fiatProvisionResolvedStorageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

export async function readFiatProvisionResolved(userId: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(fiatProvisionResolvedStorageKey(userId))
    return raw === '1'
  } catch {
    return false
  }
}

export async function writeFiatProvisionResolved(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(fiatProvisionResolvedStorageKey(userId), '1')
  } catch {
    // non-blocking
  }
}

export async function clearFiatProvisionResolved(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(fiatProvisionResolvedStorageKey(userId))
  } catch {
    // non-blocking
  }
}
