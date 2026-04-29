/**
 * Easner Design System — Mobile colors
 *
 * Graphite + ivory + Easner blue primary; emerald for success. No neon greens,
 * no purple gradients. Frosted blur uses tokenized `glass` roles for system
 * chrome (tab bar, sheets)—not full-screen decorative glassmorphism. Customer
 * app is light-only; optional dark keys exist for shared typings only.
 *
 * Structural shape is preserved for backwards-compat with existing
 * screens (`colors.primary.main`, `colors.semantic.background`, ...).
 *
 * Raw brand hex comes from `@easner/shared` `easnerBrand` (single source of truth).
 */

import { easnerBrand } from '@easner/shared'

/** Core neutrals — identical values to `easnerBrand` in packages/shared (RN flat hex). */
const brand = {
  graphite: easnerBrand.graphite,
  carbon: easnerBrand.carbon,
  ink: easnerBrand.ink,
  ivory: easnerBrand.ivory,
  cloud: easnerBrand.cloud,
  mist: easnerBrand.mist,
  stone: easnerBrand.stone,
  slate: easnerBrand.slate,
  primary: easnerBrand.primary,
  primaryHover: easnerBrand.primaryHover,
  primaryDeep: easnerBrand.primaryDeep,
  navy: easnerBrand.navy,
  tintBlue: easnerBrand.tintBlue,
  darkAccent: easnerBrand.darkAccent,
  darkPrimaryHover: easnerBrand.darkPrimaryHover,
  emerald: easnerBrand.emerald,
  emeraldDeep: easnerBrand.emeraldDeep,
  amber: easnerBrand.amber,
  oxblood: easnerBrand.oxblood,
} as const

type ColorPalette = {
  primary: {
    main: string
    light: string
    dark: string
    gradient: readonly [string, string]
    gradientDark: readonly [string, string]
    /** Sky-blue hero gradient reserved for hero cards / promo banners (#007ACC -> #0EA5E9). */
    heroGradient: readonly [string, string]
  }
  accent: { positive: string }
  success: {
    main: string
    light: string
    dark: string
    gradient: readonly [string, string]
    background: string
  }
  warning: {
    main: string
    light: string
    dark: string
    gradient: readonly [string, string]
    background: string
  }
  error: {
    main: string
    light: string
    dark: string
    gradient: readonly [string, string]
    background: string
  }
  neutral: {
    white: string
    50: string
    100: string
    200: string
    300: string
    400: string
    500: string
    600: string
    700: string
    800: string
    900: string
    black: string
  }
  background: {
    primary: string
    secondary: string
    tertiary: string
    dark: string
  }
  text: {
    primary: string
    secondary: string
    tertiary: string
    inverse: string
    link: string
  }
  cardGradients: {
    premium: readonly [string, string]
    blue: readonly [string, string]
    purple: readonly [string, string]
    green: readonly [string, string]
    gold: readonly [string, string]
  }
  glass: {
    background: string
    border: string
    backgroundDark: string
    surface: string
    highlight: string
  }
  status: {
    pending: string
    processing: string
    completed: string
    failed: string
    cancelled: string
  }
  border: {
    light: string
    default: string
    dark: string
  }
  frame: {
    background: string
    border: string
  }
  semantic: {
    background: string
    foreground: string
    card: string
    cardForeground: string
    muted: string
    mutedForeground: string
    border: string
    input: string
    destructive: string
    destructiveForeground: string
    ring: string
  }
  brand: typeof brand
}

export const lightColors: ColorPalette = {
  primary: {
    main: brand.primary,
    light: '#3399D6',
    dark: brand.primaryHover,
    gradient: [brand.primaryDeep, brand.primary] as const,
    gradientDark: [brand.primaryHover, '#3399D6'] as const,
    heroGradient: ['#007ACC', '#0EA5E9'] as const,
  },

  accent: {
    positive: '#16A34A',
  },

  success: {
    main: '#16A34A',
    light: '#22C55E',
    dark: '#15803D',
    gradient: ['#16A34A', '#22C55E'] as const,
    background: 'rgba(22, 163, 74, 0.10)',
  },

  warning: {
    main: '#D97706',
    light: '#F59E0B',
    dark: '#B45309',
    gradient: ['#D97706', '#F59E0B'] as const,
    background: 'rgba(217, 119, 6, 0.10)',
  },

  error: {
    main: '#DC2626',
    light: '#EF4444',
    dark: '#B91C1C',
    gradient: ['#DC2626', '#EF4444'] as const,
    background: 'rgba(220, 38, 38, 0.10)',
  },

  neutral: {
    white: '#FFFFFF',
    50: brand.cloud,
    100: brand.ivory,
    200: brand.mist,
    300: brand.stone,
    400: '#B5B1A4',
    500: brand.slate,
    600: '#4C514C',
    700: '#363A37',
    800: brand.ink,
    900: brand.graphite,
    black: '#000000',
  },

  background: {
    primary: '#F4F5F7',
    secondary: '#FFFFFF',
    tertiary: '#FFFFFF',
    dark: brand.graphite,
  },

  text: {
    primary: '#0F172A',
    secondary: '#6B7280',
    tertiary: '#9CA3AF',
    inverse: '#FFFFFF',
    link: brand.primary,
  },

  cardGradients: {
    /** Sky-blue identity hero (matches `primary.heroGradient`). */
    premium: ['#007ACC', '#0EA5E9'] as const,
    blue: ['#007ACC', '#0EA5E9'] as const,
    purple: [brand.carbon, brand.ink] as const,
    green: ['#16A34A', '#22C55E'] as const,
    gold: [brand.ink, brand.graphite] as const,
  },

  glass: {
    background: 'rgba(255, 255, 255, 0.82)',
    border: 'rgba(15, 17, 16, 0.08)',
    backgroundDark: 'rgba(18, 20, 22, 0.75)',
    surface: 'rgba(255, 255, 255, 0.72)',
    highlight: 'rgba(255, 255, 255, 0.92)',
  },

  status: {
    pending: '#D97706',
    processing: brand.slate,
    completed: '#16A34A',
    failed: '#DC2626',
    cancelled: brand.slate,
  },

  border: {
    /** Canonical hairline used for dividers, section frames, and inputs. */
    light: '#E5E7EB',
    default: '#E5E7EB',
    /** Slightly darker — reserved for switch tracks and other edge cases. */
    dark: '#D3D8E0',
  },

  /** Raised plates on the gray canvas — crisp white with hairline border. */
  frame: {
    background: '#FFFFFF',
    border: '#E5E7EB',
  },

  semantic: {
    background: '#F4F5F7',
    foreground: '#0F172A',
    card: '#FFFFFF',
    cardForeground: '#0F172A',
    muted: '#F4F5F7',
    mutedForeground: '#6B7280',
    border: '#E5E7EB',
    input: '#E5E7EB',
    destructive: '#DC2626',
    destructiveForeground: '#FFFFFF',
    ring: brand.primary,
  },

  brand,
}

export const darkColors: ColorPalette = {
  primary: {
    main: brand.darkAccent,
    light: '#6BB8F0',
    dark: brand.darkPrimaryHover,
    gradient: [brand.darkPrimaryHover, brand.darkAccent] as const,
    gradientDark: [brand.darkPrimaryHover, '#6BB8F0'] as const,
    heroGradient: [brand.darkPrimaryHover, brand.darkAccent] as const,
  },

  accent: {
    positive: brand.emerald,
  },

  success: {
    main: brand.emerald,
    light: '#22B382',
    dark: brand.emeraldDeep,
    gradient: [brand.emerald, '#22B382'] as const,
    background: 'rgba(15, 138, 95, 0.14)',
  },

  warning: {
    main: '#C18A32',
    light: '#D9A353',
    dark: brand.amber,
    gradient: ['#C18A32', '#D9A353'] as const,
    background: 'rgba(193, 138, 50, 0.14)',
  },

  error: {
    main: '#9C4747',
    light: '#B56464',
    dark: brand.oxblood,
    gradient: ['#9C4747', '#B56464'] as const,
    background: 'rgba(156, 71, 71, 0.14)',
  },

  neutral: {
    white: brand.ivory,
    50: '#1e2124',
    100: brand.ink,
    200: '#2b2e31',
    300: '#383c42',
    400: '#5a5e66',
    500: brand.slate,
    600: '#8c94a0',
    700: '#a8b0bd',
    800: '#c8ced8',
    900: brand.ivory,
    black: '#000000',
  },

  background: {
    primary: brand.graphite,
    secondary: brand.carbon,
    tertiary: brand.ink,
    dark: '#0a0b0d',
  },

  text: {
    primary: brand.ivory,
    secondary: '#a8b0bd',
    tertiary: '#6f7580',
    inverse: brand.graphite,
    link: brand.darkAccent,
  },

  cardGradients: {
    premium: [brand.graphite, brand.carbon] as const,
    blue: [brand.graphite, brand.ink] as const,
    purple: [brand.carbon, brand.ink] as const,
    green: [brand.emeraldDeep, brand.emerald] as const,
    gold: [brand.ink, brand.graphite] as const,
  },

  glass: {
    background: 'rgba(23, 26, 28, 0.85)',
    border: 'rgba(246, 243, 235, 0.06)',
    backgroundDark: 'rgba(18, 20, 23, 0.9)',
    surface: 'rgba(30, 33, 36, 0.82)',
    highlight: 'rgba(40, 44, 48, 0.92)',
  },

  status: {
    pending: '#C18A32',
    processing: '#a8b0bd',
    completed: brand.emerald,
    failed: '#9C4747',
    cancelled: brand.slate,
  },

  border: {
    light: '#2b2e31',
    default: '#383c42',
    dark: '#5a5e66',
  },

  frame: {
    background: brand.carbon,
    border: '#2b2e31',
  },

  semantic: {
    background: brand.graphite,
    foreground: brand.ivory,
    card: brand.carbon,
    cardForeground: brand.ivory,
    muted: '#26292c',
    mutedForeground: '#a8b0bd',
    border: '#2b2e31',
    input: '#2b2e31',
    destructive: '#9C4747',
    destructiveForeground: brand.ivory,
    ring: brand.darkAccent,
  },

  brand,
}

/**
 * Default export — preserves backwards-compat for call sites that
 * `import { colors }`. Defaults to the light palette; screens that
 * need dynamic theming should use `useThemeColors()` from
 * `ThemePaletteContext` instead.
 */
export const colors: ColorPalette = lightColors

export type Colors = ColorPalette
