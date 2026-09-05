import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

/** SecureStore caps ~2048 bytes; large JWT sessions use AsyncStorage (same device). */
const AUTH_LARGE_KEY_PREFIX = '@easner-sb-auth-large:'

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL
const supabasePublishableKey =
  Constants.expoConfig?.extra?.supabasePublishableKey ||
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const supabaseConfigError =
  !supabaseUrl || !supabasePublishableKey
    ? 'Missing Supabase environment variables. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY for this build.'
    : null

const resolvedSupabaseUrl = supabaseUrl || 'https://missing-config.supabase.co'
const resolvedSupabasePublishableKey = supabasePublishableKey || 'missing-supabase-publishable-key'

// Custom storage: SecureStore when small; full session in AsyncStorage when >2048 bytes
const ExpoSecureStoreAdapter = {
  getItem: async (key: string) => {
    try {
      const large = await AsyncStorage.getItem(AUTH_LARGE_KEY_PREFIX + key)
      if (large != null) return large
      return await SecureStore.getItemAsync(key)
    } catch (error) {
      console.warn('SecureStore getItem error:', error)
      return null
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      const byteSize = new Blob([value]).size
      if (key.includes('auth-token') && byteSize > 2048) {
        await AsyncStorage.setItem(AUTH_LARGE_KEY_PREFIX + key, value)
        await SecureStore.deleteItemAsync(key).catch(() => undefined)
        return
      }
      await AsyncStorage.removeItem(AUTH_LARGE_KEY_PREFIX + key).catch(() => undefined)
      await SecureStore.setItemAsync(key, value)
    } catch (error) {
      console.warn('SecureStore setItem error:', error)
    }
  },
  removeItem: async (key: string) => {
    try {
      await SecureStore.deleteItemAsync(key)
      await AsyncStorage.removeItem(AUTH_LARGE_KEY_PREFIX + key)
    } catch (error) {
      console.warn('SecureStore removeItem error:', error)
    }
  },
}

/** Expo web: SecureStore is unavailable; AsyncStorage maps to localStorage. */
const WebAsyncStorageAdapter = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
}

const authStorage = Platform.OS === 'web' ? WebAsyncStorageAdapter : ExpoSecureStoreAdapter

// Client-side Supabase client (singleton pattern)
export const supabase = createClient(resolvedSupabaseUrl, resolvedSupabasePublishableKey, {
  auth: {
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
  global: {
    headers: {
      'X-Client-Info': 'easner-mobile-app'
    }
  }
})

/**
 * Stale SecureStore/AsyncStorage after env switch, simulator reset, or revoked refresh token
 * causes GoTrue to throw `Invalid Refresh Token`. Clear local session only (no server call).
 */
export async function clearInvalidPersistedAuthSession(): Promise<void> {
  const { error } = await supabase.auth.getSession()
  if (!error) return
  const msg = `${error.message || ''} ${(error as { code?: string }).code || ''}`.toLowerCase()
  if (msg.includes('refresh') || msg.includes('invalid jwt') || msg.includes('jwt expired')) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
  }
}

// Auth helper functions
export const getCurrentUser = async () => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()
  if (error || !session?.user) throw error ?? new Error('Not authenticated')
  return session.user
}

export const signOut = async (options?: { scope?: 'local' | 'global' }) => {
  const { error } = await supabase.auth.signOut({ scope: options?.scope ?? 'local' })
  if (error) throw error
}
