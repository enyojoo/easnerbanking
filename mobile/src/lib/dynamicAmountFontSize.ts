import { Platform, StyleSheet, type TextStyle } from 'react-native'

const REFERENCE_MAX = 65

export type DynamicAmountFontSizeOptions = {
  /** Smallest size for very long amounts (default 28). */
  minSize?: number
  /** Size for short amounts, ≤5 digits (default 65). */
  maxSize?: number
}

/**
 * Scale headline money type by digit count (Send Amount input, transaction detail hero).
 * Ignores commas, signs, and currency symbols — counts digits only.
 */
export function getDynamicAmountFontSize(
  amountText: string,
  options: DynamicAmountFontSizeOptions = {},
): number {
  const minSize = options.minSize ?? 28
  const maxSize = options.maxSize ?? REFERENCE_MAX
  const numericLength = amountText.replace(/,/g, '').replace(/[^0-9]/g, '').length || 1

  const scale = maxSize / REFERENCE_MAX
  let tierPx: number
  if (numericLength <= 5) {
    tierPx = REFERENCE_MAX
  } else if (numericLength === 6) {
    tierPx = 55
  } else if (numericLength === 7 || numericLength === 8) {
    tierPx = 50
  } else {
    tierPx = 50 - (numericLength - 8) * 5
  }

  const fontSize = Math.round(tierPx * scale)
  return Math.min(maxSize, Math.max(minSize, fontSize))
}

export function buildDynamicAmountTextStyle(
  base: TextStyle | TextStyle[],
  amountText: string,
  options?: DynamicAmountFontSizeOptions,
): TextStyle {
  const fontSize = getDynamicAmountFontSize(amountText, options)
  const lineHeight = Math.round(fontSize * 1.12)
  return {
    ...(StyleSheet.flatten(base) ?? {}),
    fontSize,
    lineHeight,
    ...Platform.select({
      android: { includeFontPadding: false, paddingVertical: 0, marginVertical: 0 },
      default: { paddingVertical: 0, marginVertical: 0 },
    }),
  }
}
