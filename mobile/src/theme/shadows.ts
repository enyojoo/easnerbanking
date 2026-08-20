/**
 * Easner Design System – Mobile shadows
 *
 * Soft, graphite-based elevation. No glows, no colored shadows.
 * All layers use the graphite base (`#0F1110`) so cards feel lifted
 * against ivory and substantial against graphite surfaces.
 *
 * Keys (`xs`, `sm`, `md`, `lg`, `xl`, `none`) match the prior API so
 * screens don't need to be updated. The legacy `primary`, `success`,
 * and `glow` keys are retained but re-authored as neutral graphite
 * shadows – no brand-colored drop shadows.
 */

import type { ViewStyle } from 'react-native'

type ShadowStyle = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
>

const GRAPHITE = '#0F1110'

export const shadows: Record<string, ShadowStyle> = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },

  xs: {
    shadowColor: GRAPHITE,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },

  sm: {
    shadowColor: GRAPHITE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },

  md: {
    shadowColor: GRAPHITE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },

  lg: {
    shadowColor: GRAPHITE,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.10,
    shadowRadius: 32,
    elevation: 6,
  },

  xl: {
    shadowColor: GRAPHITE,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 40,
    elevation: 8,
  },

  primary: {
    shadowColor: GRAPHITE,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 6,
  },

  success: {
    shadowColor: GRAPHITE,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.10,
    shadowRadius: 28,
    elevation: 5,
  },

  glow: {
    shadowColor: GRAPHITE,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.14,
    shadowRadius: 40,
    elevation: 10,
  },

  inner: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
}

export const combineShadows = (...shadowKeys: (keyof typeof shadows)[]): ShadowStyle => {
  return shadowKeys.reduce((acc, key) => ({
    ...acc,
    ...shadows[key],
  }), {} as ShadowStyle)
}

export type Shadows = typeof shadows
