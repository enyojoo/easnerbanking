/**
 * Easner Premium Design System - Typography
 * 
 * Type scale and text styles for consistent hierarchy
 */

import { TextStyle, Platform, Dimensions, PixelRatio } from 'react-native'

// Font families - Using Outfit from Google Fonts
export const fontFamily = {
  regular: 'Outfit-Regular',
  medium: 'Outfit-Medium',
  semibold: 'Outfit-SemiBold',
  bold: 'Outfit-Bold',
  /** Matches send-amount hero / keypad (Outfit-Black). */
  black: 'Outfit-Black',
}

// Font weights
export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
  black: '900' as const,
}

// Font sizes following a harmonious scale
export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  '2xl': 28,
  '3xl': 34,
  '4xl': 40,
  '5xl': 48,
  /** Hero balance / send amount (Cash-like scale). */
  '6xl': 56,
}

/** Clamp font scale for accessibility (v2 money + titles). */
export function typographyScale(width?: number): number {
  const w = width ?? Dimensions.get('window').width
  const fs = PixelRatio.getFontScale()
  const widthFactor = Math.min(Math.max(w / 375, 0.92), 1.08)
  const fontFactor = Math.min(Math.max(fs, 1), 1.2)
  return widthFactor * fontFactor
}

export function scaledFontSize(px: number, width?: number): number {
  return Math.round(px * typographyScale(width))
}

// Line heights
export const lineHeight = {
  tight: 1.1,
  snug: 1.25,
  normal: 1.4,
  relaxed: 1.5,
  loose: 1.75,
}

// Letter spacing
export const letterSpacing = {
  tighter: -0.5,
  tight: -0.25,
  normal: 0,
  wide: 0.25,
  wider: 0.5,
  widest: 1,
}

// Pre-defined text styles
export const textStyles: Record<string, TextStyle> = {
  // Display - Large headlines
  displayLarge: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize['5xl'],
    fontWeight: fontWeight.bold,
    lineHeight: fontSize['5xl'] * lineHeight.tight,
    letterSpacing: letterSpacing.tight,
  },
  displayMedium: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize['4xl'],
    fontWeight: fontWeight.bold,
    lineHeight: fontSize['4xl'] * lineHeight.tight,
    letterSpacing: letterSpacing.tight,
  },
  displaySmall: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    lineHeight: fontSize['3xl'] * lineHeight.tight,
    letterSpacing: letterSpacing.tight,
  },

  // Headlines
  headlineLarge: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize['2xl'] * lineHeight.snug,
  },
  headlineMedium: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize.xl * lineHeight.snug,
    ...Platform.select({
      android: { includeFontPadding: false, lineHeight: Math.round(fontSize.xl * lineHeight.snug) + 4 },
      default: {},
    }),
  },
  headlineSmall: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize.lg * lineHeight.snug,
  },

  // Titles
  titleLarge: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize.md * lineHeight.normal,
  },
  titleMedium: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    lineHeight: fontSize.base * lineHeight.normal,
  },
  titleSmall: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: fontSize.sm * lineHeight.normal,
  },

  // Body text
  bodyLarge: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.base,
    fontWeight: fontWeight.regular,
    lineHeight: fontSize.base * lineHeight.relaxed,
  },
  bodyMedium: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    lineHeight: fontSize.sm * lineHeight.relaxed,
    ...Platform.select({
      android: {
        includeFontPadding: false,
        lineHeight: Math.round(fontSize.sm * lineHeight.relaxed) + 4,
      },
      default: {},
    }),
  },
  bodySmall: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.regular,
    lineHeight: fontSize.xs * lineHeight.relaxed,
    ...Platform.select({
      android: {
        includeFontPadding: false,
        lineHeight: Math.round(fontSize.xs * lineHeight.relaxed) + 4,
      },
      default: {},
    }),
  },

  /**
   * Single-line TextInput — intentionally no `lineHeight`.
   * Body styles’ relaxed lineHeight shifts caret/text vertically on iOS and Android.
   */
  textInputSingleLine: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.base,
    fontWeight: fontWeight.regular,
  },
  textInputMedium: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
  },

  // Labels
  labelLarge: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: fontSize.sm * lineHeight.normal,
    letterSpacing: letterSpacing.wide,
  },
  labelMedium: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    lineHeight: fontSize.xs * lineHeight.normal,
    letterSpacing: letterSpacing.wide,
  },
  labelSmall: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    fontWeight: fontWeight.medium,
    lineHeight: 10 * lineHeight.normal,
    letterSpacing: letterSpacing.wider,
    textTransform: 'uppercase',
    ...Platform.select({
      android: { includeFontPadding: false, lineHeight: 16 },
      default: {},
    }),
  },

  // Special - Numbers/Currency
  currencyLarge: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    lineHeight: fontSize['3xl'] * lineHeight.tight,
    letterSpacing: letterSpacing.tight,
    fontVariant: ['tabular-nums'],
  },
  currencyMedium: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize.xl * lineHeight.tight,
    letterSpacing: letterSpacing.tight,
    fontVariant: ['tabular-nums'],
  },
  currencySmall: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize.md * lineHeight.tight,
    fontVariant: ['tabular-nums'],
  },

  /** Primary balance line on Dashboard — same face/weight as send amount (`SendAmountScreen`). */
  balanceDisplay: {
    fontFamily: fontFamily.black,
    fontSize: fontSize['6xl'],
    fontWeight: fontWeight.black,
    lineHeight: Math.round(fontSize['6xl'] * lineHeight.tight),
    letterSpacing: letterSpacing.tight,
    fontVariant: ['tabular-nums'],
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
}

export type Typography = typeof textStyles

