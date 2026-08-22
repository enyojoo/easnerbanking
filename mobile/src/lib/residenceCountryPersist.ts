import AsyncStorage from '@react-native-async-storage/async-storage'
import { PENDING_RESIDENCE_COUNTRY_KEY } from '../constants/residenceCountry'
import { supabase } from './supabase'

function normalizeIso2(value: unknown): string {
  const code = String(value || '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : ''
}

export function residenceCountryFromProfile(profile: {
  residence_country?: string | null
  kyc_address_country?: string | null
  profile?: {
    residence_country?: string | null
    kyc_address_country?: string | null
  }
} | null | undefined): string {
  return (
    normalizeIso2(profile?.residence_country) ||
    normalizeIso2(profile?.profile?.residence_country) ||
    normalizeIso2(profile?.kyc_address_country) ||
    normalizeIso2(profile?.profile?.kyc_address_country)
  )
}

export async function readPendingResidenceCountry(): Promise<string> {
  try {
    return normalizeIso2(await AsyncStorage.getItem(PENDING_RESIDENCE_COUNTRY_KEY))
  } catch {
    return ''
  }
}

export async function saveResidenceCountryToUser(userId: string, code: string): Promise<string> {
  const residence = normalizeIso2(code)
  if (!userId || !residence) return ''
  const { error } = await supabase
    .from('users')
    .update({
      residence_country: residence,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
  if (error) throw error
  await AsyncStorage.removeItem(PENDING_RESIDENCE_COUNTRY_KEY).catch(() => undefined)
  return residence
}

/** Profile first, then the country saved at signup. Backfills `users.residence_country` when missing. */
export async function resolveResidenceCountryForUser(
  userId: string | undefined,
  profile: Parameters<typeof residenceCountryFromProfile>[0],
): Promise<string> {
  const fromProfile = residenceCountryFromProfile(profile)
  if (fromProfile) return fromProfile
  const pending = await readPendingResidenceCountry()
  if (!pending || !userId) return pending
  try {
    return await saveResidenceCountryToUser(userId, pending)
  } catch {
    return pending
  }
}
