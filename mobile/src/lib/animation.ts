import { Platform } from 'react-native'

/** RN Web has no native animated module; use JS driver to avoid console warnings. */
export const USE_NATIVE_DRIVER = Platform.OS !== 'web'
