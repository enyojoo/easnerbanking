import { Platform } from 'react-native'
import Intercom, { Space } from '@intercom/intercom-react-native'
import type { User } from '../types'

let lastSyncedKey: string | null = null

function identityKey(user: User): string {
  const email = user.email?.trim() ?? ''
  return `${user.id}\u0000${email}\u0000${user.full_name ?? ''}`
}

/**
 * Keeps Intercom aligned with the Supabase-backed user. Safe to call on every profile update.
 */
export async function syncIntercomIdentity(user: User | null): Promise<void> {
  if (Platform.OS === 'web') return

  try {
    if (!user?.id) {
      if (lastSyncedKey !== null) {
        await Intercom.logout()
        lastSyncedKey = null
      }
      return
    }

    const key = identityKey(user)
    if (lastSyncedKey === key) return

    const email = user.email?.trim()
    await Intercom.loginUserWithUserAttributes({
      userId: user.id,
      ...(email ? { email } : {}),
      ...(user.full_name?.trim() ? { name: user.full_name.trim() } : {}),
    })
    lastSyncedKey = key
  } catch (e) {
    if (
      e instanceof Error &&
      e.message.includes('Intercom native module is not linked')
    ) {
      if (__DEV__) {
        console.warn('[Intercom]', e.message)
      }
      return
    }
    console.warn('[Intercom] syncIntercomIdentity failed:', e)
  }
}

/** Opens the Intercom Messenger on the Messages space (live chat). */
export async function presentIntercomMessenger(): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('Live chat is only available in the mobile app.')
  }
  await Intercom.presentSpace(Space.messages)
}
