import AsyncStorage from '@react-native-async-storage/async-storage'

const SIGNUP_BLOCKED_MESSAGE_KEY = '@easner_signup_blocked_message'

export async function stashSignupBlockedMessage(message: string): Promise<void> {
  try {
    await AsyncStorage.setItem(SIGNUP_BLOCKED_MESSAGE_KEY, message)
  } catch {
    // ignore
  }
}

export async function consumeSignupBlockedMessage(): Promise<string | null> {
  try {
    const message = await AsyncStorage.getItem(SIGNUP_BLOCKED_MESSAGE_KEY)
    if (message) await AsyncStorage.removeItem(SIGNUP_BLOCKED_MESSAGE_KEY)
    return message
  } catch {
    return null
  }
}
