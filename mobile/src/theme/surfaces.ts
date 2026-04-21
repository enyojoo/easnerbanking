import { type Colors } from './colors'

export type SurfaceTokens = {
  appBg: string
  card: string
  cardElevated: string
  heroGraphite: readonly [string, string]
  glassSurface: string
  glassBorder: string
  glassHighlight: string
}

export function resolveSurfaceTokens(colors: Colors): SurfaceTokens {
  return {
    appBg: colors.background.primary,
    card: colors.semantic.card,
    cardElevated: colors.background.secondary,
    heroGraphite: colors.cardGradients.premium,
    glassSurface: colors.glass.surface,
    glassBorder: colors.glass.border,
    glassHighlight: colors.glass.highlight,
  }
}

