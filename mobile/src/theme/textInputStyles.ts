import { Platform, type TextStyle, type ViewStyle } from 'react-native'
import { textStyles, fontFamily } from './typography'

const S2 = 8
const S3 = 12

export const FORM_FIELD_MIN_HEIGHT = 52
export const COMPACT_FIELD_MIN_HEIGHT = 48

/**
 * Vertical metrics for standard single-line fields (auth, TextField, passwords).
 * Always include `web` – RN Web omits ios/android branches and collapses inputs.
 */
export const standardInputMetrics: TextStyle = Platform.select({
  android: { includeFontPadding: false, minHeight: FORM_FIELD_MIN_HEIGHT },
  ios: { paddingVertical: 11, minHeight: FORM_FIELD_MIN_HEIGHT },
  web: {
    paddingVertical: S3,
    minHeight: FORM_FIELD_MIN_HEIGHT,
    lineHeight: 22,
    outlineStyle: 'none',
  },
  default: { paddingVertical: S3, minHeight: FORM_FIELD_MIN_HEIGHT },
}) as TextStyle

/** Compact recipient / modal form fields (48px, 13px body). */
export const compactInputMetrics: TextStyle = Platform.select({
  android: { includeFontPadding: false, minHeight: COMPACT_FIELD_MIN_HEIGHT },
  ios: { minHeight: COMPACT_FIELD_MIN_HEIGHT },
  web: {
    minHeight: COMPACT_FIELD_MIN_HEIGHT,
    lineHeight: 18,
    outlineStyle: 'none',
  },
  default: { minHeight: COMPACT_FIELD_MIN_HEIGHT },
}) as TextStyle

/** TextInput nested inside icon pill rows (search, send note, phone row). */
export const inlinePillInputMetrics: TextStyle = Platform.select({
  android: { includeFontPadding: false, paddingVertical: 0 },
  ios: { paddingVertical: 0 },
  web: { paddingVertical: 0, minHeight: 22, lineHeight: 22, outlineStyle: 'none' },
  default: { paddingVertical: 0 },
}) as TextStyle

/** Icon + input pill row wrapper (send note, phone entry, etc.). */
export const pillRowWrapperStyle: ViewStyle = Platform.select({
  ios: { paddingVertical: S3 },
  android: { paddingVertical: S2, minHeight: 44 },
  web: { paddingVertical: S3, minHeight: 44 },
  default: { paddingVertical: S3, minHeight: 44 },
}) as ViewStyle

/** Send amount / inline note field (13px body inside pill row). */
export const pillNoteInputStyle: TextStyle = {
  flex: 1,
  minWidth: 0,
  ...textStyles.bodyMedium,
  fontFamily: fontFamily.regular,
  fontSize: 13,
  lineHeight: 18,
  textAlignVertical: 'center',
  ...Platform.select({
    android: { includeFontPadding: false, paddingVertical: 0 },
    ios: { paddingVertical: 0 },
    web: { paddingVertical: 0, minHeight: 18, lineHeight: 18, outlineStyle: 'none' },
    default: { paddingVertical: 0 },
  }),
}

/** Reusable compact bordered field base (recipient modals, wallet address). */
export const compactFormInputStyle: TextStyle = {
  ...textStyles.bodyMedium,
  fontFamily: fontFamily.regular,
  fontSize: 13,
  lineHeight: 18,
  textAlignVertical: 'center',
  paddingVertical: S3,
  ...compactInputMetrics,
}
