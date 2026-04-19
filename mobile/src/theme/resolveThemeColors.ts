import type { ColorSchemeName } from 'react-native'
import { darkColors, lightColors } from './colors'
import type { Colors } from './colors'

/**
 * Resolve the active mobile palette for a given color scheme.
 *
 * Falls back to the light palette when the scheme is unknown or null
 * (e.g., initial render before `useColorScheme()` settles).
 */
export function resolveThemeColors(scheme?: ColorSchemeName | null): Colors {
  return scheme === 'dark' ? darkColors : lightColors
}
