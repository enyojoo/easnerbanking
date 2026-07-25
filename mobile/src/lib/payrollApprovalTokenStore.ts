import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const KEY = 'easner_payroll_approval_token'

export async function storePayrollApprovalToken(token: string): Promise<void> {
  const value = token.trim()
  if (!value) return
  if (Platform.OS === 'web') {
    sessionStorage.setItem(KEY, value)
    return
  }
  await SecureStore.setItemAsync(KEY, value)
}

export async function readPayrollApprovalToken(): Promise<string | null> {
  if (Platform.OS === 'web') return sessionStorage.getItem(KEY)
  return SecureStore.getItemAsync(KEY)
}

export async function clearPayrollApprovalToken(): Promise<void> {
  if (Platform.OS === 'web') {
    sessionStorage.removeItem(KEY)
    return
  }
  await SecureStore.deleteItemAsync(KEY)
}
