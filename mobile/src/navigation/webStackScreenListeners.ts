import { Platform } from 'react-native'
import { blurActiveElementOnWeb } from '../lib/webFocus'

/** Blur DOM focus when a stack screen loses focus on web. */
export const webStackScreenListeners =
  Platform.OS === 'web'
    ? {
        blur: () => {
          blurActiveElementOnWeb()
        },
      }
    : undefined
