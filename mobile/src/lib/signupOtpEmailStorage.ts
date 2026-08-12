import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

const SIGNUP_OTP_EMAIL_KEY = 'easner-signup-otp-email'

export async function stashSignupOtpEmail(email: string): Promise<void> {
  const trimmed = email.trim()
  if (!trimmed) return
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(SIGNUP_OTP_EMAIL_KEY, trimmed)
    return
  }
  await AsyncStorage.setItem(SIGNUP_OTP_EMAIL_KEY, trimmed)
}

export async function readSignupOtpEmail(): Promise<string | null> {
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    const raw = sessionStorage.getItem(SIGNUP_OTP_EMAIL_KEY)
    return raw?.trim() || null
  }
  const raw = await AsyncStorage.getItem(SIGNUP_OTP_EMAIL_KEY)
  return raw?.trim() || null
}

export async function clearSignupOtpEmail(): Promise<void> {
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(SIGNUP_OTP_EMAIL_KEY)
    return
  }
  await AsyncStorage.removeItem(SIGNUP_OTP_EMAIL_KEY)
}
