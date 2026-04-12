import type { ColorSchemeName } from 'react-native'
import { colors } from './colors'
import type { Colors } from './colors'

/** Dark overrides — merge on top of base `colors`. */
export function resolveThemeColors(scheme: ColorSchemeName | null | undefined): Colors {
  if (scheme !== 'dark') {
    return colors
  }
  return {
    ...colors,
    background: {
      ...colors.background,
      primary: '#0F172A',
      secondary: '#1E293B',
      tertiary: '#334155',
    },
    text: {
      ...colors.text,
      primary: '#F1F5F9',
      secondary: '#94A3B8',
      tertiary: '#64748B',
      inverse: '#0F172A',
      link: '#5EB3E8',
    },
    semantic: {
      ...colors.semantic,
      background: '#0F172A',
      foreground: '#F8FAFC',
      muted: '#1E293B',
      mutedForeground: '#94A3B8',
      border: '#334155',
      input: '#334155',
      card: '#1E293B',
      cardForeground: '#F8FAFC',
    },
    frame: {
      background: '#1E293B',
      border: '#334155',
    },
    border: {
      ...colors.border,
      light: '#27364A',
      default: '#334155',
      dark: '#475569',
    },
  }
}
