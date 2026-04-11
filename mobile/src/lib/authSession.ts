import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * Resolves the current Supabase session after SecureStore/AsyncStorage hydration.
 * Prefer this over raw `getSession()` when calling APIs right after sign-in or cold start.
 */
export async function getSessionReliable(): Promise<Session | null> {
  const { data: first } = await supabase.auth.getSession()
  if (first.session?.access_token) {
    return first.session
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    await new Promise((r) => setTimeout(r, 75 * (attempt + 1)))
    const { data } = await supabase.auth.getSession()
    if (data.session?.access_token) {
      return data.session
    }
  }

  const { data: userData } = await supabase.auth.getUser()
  if (userData.user) {
    const { data } = await supabase.auth.getSession()
    if (data.session?.access_token) {
      return data.session
    }
  }

  return null
}
