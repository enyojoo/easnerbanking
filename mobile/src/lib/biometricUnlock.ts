import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  biometricPromptMessage,
  biometricUnlockTitle,
  pickUnlockBiometric,
  type BiometricAvailability,
  type BiometricKind,
  type BiometricPromptPurpose,
} from './biometricUnlockPolicy'

export type { BiometricAvailability, BiometricKind }

type LocalAuth = typeof import('expo-local-authentication')

const PREF_PREFIX = '@easner_unlock_with_biometrics_'

function getLocalAuth(): LocalAuth | null {
  if (Platform.OS === 'web') return null
  try {
    return require('expo-local-authentication') as LocalAuth
  } catch {
    return null
  }
}

function platformKind(): 'ios' | 'android' | 'web' {
  if (Platform.OS === 'ios') return 'ios'
  if (Platform.OS === 'android') return 'android'
  return 'web'
}

export function biometricUnlockLabel(kind: BiometricKind | null): string {
  return biometricUnlockTitle(platformKind(), kind)
}

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  const LocalAuthentication = getLocalAuth()
  if (!LocalAuthentication) return { available: false, kind: null }
  try {
    const [hasHardware, enrolled, types, enrolledLevel] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
    ])
    const AuthType = LocalAuthentication.AuthenticationType
    const strongEnrolled =
      Boolean(hasHardware && enrolled) &&
      enrolledLevel >= LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG
    return pickUnlockBiometric({
      platform: platformKind(),
      strongEnrolled,
      fingerprint: types.includes(AuthType.FINGERPRINT),
      face: types.includes(AuthType.FACIAL_RECOGNITION),
      iris: types.includes(AuthType.IRIS),
    })
  } catch {
    return { available: false, kind: null }
  }
}

export async function isBiometricUnlockEnabled(userId: string): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(`${PREF_PREFIX}${userId}`)
    return v !== '0'
  } catch {
    return true
  }
}

export async function setBiometricUnlockEnabled(userId: string, enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(`${PREF_PREFIX}${userId}`, enabled ? '1' : '0')
  } catch {
    // ignore
  }
}

export type BiometricUnlockResult = 'success' | 'cancel' | 'fail' | 'lockout' | 'unavailable'

export async function authenticateWithBiometrics(
  kind: BiometricKind | null,
  purpose: BiometricPromptPurpose,
): Promise<BiometricUnlockResult> {
  const LocalAuthentication = getLocalAuth()
  if (!LocalAuthentication) return 'unavailable'
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: biometricPromptMessage(platformKind(), kind, purpose),
      cancelLabel: purpose === 'enable' ? 'Not now' : 'Use PIN',
      disableDeviceFallback: true,
      fallbackLabel: '',
      requireConfirmation: false,
      biometricsSecurityLevel: 'strong',
    })
    if (result.success) return 'success'
    if (result.error === 'lockout') return 'lockout'
    if (
      result.error === 'user_cancel' ||
      result.error === 'system_cancel' ||
      result.error === 'app_cancel' ||
      result.error === 'user_fallback'
    ) {
      return 'cancel'
    }
    return 'fail'
  } catch {
    return 'unavailable'
  }
}

export async function authenticateAppUnlock(kind: BiometricKind | null): Promise<BiometricUnlockResult> {
  return authenticateWithBiometrics(kind, 'unlock')
}

export async function authenticatePaymentConfirm(
  kind: BiometricKind | null,
): Promise<BiometricUnlockResult> {
  return authenticateWithBiometrics(kind, 'confirm')
}

/** After PIN create: OS Face ID / fingerprint sheet. Yes → same shortcut for unlock and send. */
export async function offerBiometricAfterPinSetup(userId: string): Promise<void> {
  const next = await getBiometricAvailability()
  if (!next.available) return
  const result = await authenticateWithBiometrics(next.kind, 'enable')
  await setBiometricUnlockEnabled(userId, result === 'success')
}
