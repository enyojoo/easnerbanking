import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'

/** SecureStore caps ~2048 bytes; large JWT sessions use AsyncStorage (same device). */
const AUTH_LARGE_KEY_PREFIX = '@easner-sb-auth-large:'

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabasePublishableKey =
  Constants.expoConfig?.extra?.supabasePublishableKey ||
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment variables')
}

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

// Client-side Supabase client (singleton pattern)
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // Better session detection for RLS
  },
  global: {
    headers: {
      'X-Client-Info': 'easner-mobile-app'
    }
  }
})

// Auth helper functions
export const getCurrentUser = async () => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) throw error
  return user
}

export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
