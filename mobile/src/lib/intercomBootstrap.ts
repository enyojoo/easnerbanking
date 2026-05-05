import { Platform } from 'react-native'
import Constants from 'expo-constants'
import Intercom, { Visibility } from '@intercom/intercom-react-native'

type IntercomExtra = {
  intercomConfigured?: boolean
  intercomAppId?: string
  intercomIosApiKey?: string
  intercomAndroidApiKey?: string
}

/** Native SDK uses manual init so keys are not baked into AppDelegate/MainApplication in git. */
export async function bootstrapIntercomGuestMessenger(): Promise<void> {
  const extra = Constants.expoConfig?.extra as IntercomExtra | undefined
  if (!extra?.intercomConfigured || !extra.intercomAppId) return

  const apiKey =
    Platform.OS === 'ios'
      ? extra.intercomIosApiKey
      : Platform.OS === 'android'
        ? extra.intercomAndroidApiKey
        : undefined
  if (!apiKey) return

  try {
    await Intercom.initialize(apiKey, extra.intercomAppId)
    await Intercom.loginUnidentifiedUser()
    await Intercom.setLauncherVisibility(Visibility.VISIBLE)
  } catch (e) {
    console.warn('[Intercom] bootstrap failed', e)
  }
}
