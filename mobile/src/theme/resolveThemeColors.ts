import type { ColorSchemeName } from 'react-native'
import { colors } from './colors'
import type { Colors } from './colors'

/** App is light-only; `scheme` is ignored (kept for call-site compatibility). */
export function resolveThemeColors(_scheme?: ColorSchemeName | null): Colors {
  return colors
}
