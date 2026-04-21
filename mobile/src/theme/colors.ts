/**
 * Easner Design System — Mobile colors
 *
 * Graphite + Ivory + Easner blue primary; emerald for success. No neon greens,
 * no purple gradients, no glassmorphism. Paired with dark mode support.
 *
 * Structural shape is preserved for backwards-compat with existing
 * screens (`colors.primary.main`, `colors.semantic.background`, ...),
 * but every raw hex value has been re-authored.
 *
 * Tokens are mirrored from `@easner/shared` design-system tokens where
 * possible and converted to flat hex for React Native StyleSheet.
 */

/** Core neutrals: blue-gray (~210°) so dark surfaces don’t read green vs emerald success. */
const brand = {
  graphite: '#0F1110',
  carbon: '#171a1c',
  ink: '#1b1f22',
  ivory: '#FAFAFA',
  cloud: '#FFFFFF',
  mist: '#F1F2F4',
  stone: '#E4E6EB',
  slate: '#6F7580',
  primary: '#007ACC',
  /** Hover / mid ramp — pairs with primary */
  primaryHover: '#0062A3',
  /** Pressed / deep end of ramp */
  primaryDeep: '#005A9E',
  /** Executive / institutional emphasis */
  navy: '#0A2540',
  /** Sparse selection / info surfaces */
  tintBlue: '#EAF5FD',
  /** Dark canvas primary accent */
  darkAccent: '#3AA6F8',
  /** Darker than darkAccent for pressed / gradients on dark */
  darkPrimaryHover: '#2B8FDC',
  emerald: '#0F8A5F',
  emeraldDeep: '#0A6E4C',
  amber: '#A8792A',
  oxblood: '#7A2E2E',
} as const

type ColorPalette = {
  primary: {
    main: string
    light: string
    dark: string
    gradient: readonly [string, string]
    gradientDark: readonly [string, string]
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
  },

  accent: {
    positive: brand.emerald,
  },

  success: {
    main: brand.emerald,
    light: '#1FA877',
    dark: brand.emeraldDeep,
    gradient: [brand.emerald, '#1FA877'] as const,
    background: 'rgba(15, 138, 95, 0.08)',
  },

  warning: {
    main: brand.amber,
    light: '#C49542',
    dark: '#8A6221',
    gradient: [brand.amber, '#C49542'] as const,
    background: 'rgba(168, 121, 42, 0.10)',
  },

  error: {
    main: brand.oxblood,
    light: '#9C4747',
    dark: '#5F2424',
    gradient: [brand.oxblood, '#9C4747'] as const,
    background: 'rgba(122, 46, 46, 0.08)',
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
    primary: '#FFFFFF',
    secondary: '#FAFAFA',
    tertiary: '#F4F5F7',
    dark: brand.graphite,
  },

  text: {
    primary: '#0F1110',
    secondary: '#666E7A',
    tertiary: '#8E96A3',
    inverse: brand.ivory,
    link: brand.primary,
  },

  cardGradients: {
    premium: [brand.graphite, brand.carbon] as const,
    blue: [brand.graphite, brand.ink] as const,
    purple: [brand.carbon, brand.ink] as const,
    green: [brand.emeraldDeep, brand.emerald] as const,
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
    pending: brand.amber,
    processing: brand.slate,
    completed: brand.emerald,
    failed: brand.oxblood,
    cancelled: brand.slate,
  },

  border: {
    light: '#EEF0F3',
    default: '#E2E5EA',
    dark: '#D3D8E0',
  },

  /** Raised panels / chips / list shells — subtle fill vs `background.primary` canvas (More section parity). */
  frame: {
    background: '#F9F9F9',
    border: '#E2E2E2',
  },

  semantic: {
    background: '#FFFFFF',
    foreground: '#0F1110',
    card: '#FFFFFF',
    cardForeground: '#0F1110',
    muted: '#F4F5F7',
    mutedForeground: '#666E7A',
    border: '#E2E5EA',
    input: '#E2E5EA',
    destructive: brand.oxblood,
    destructiveForeground: brand.ivory,
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
