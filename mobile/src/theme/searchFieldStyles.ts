import { Platform, type TextStyle, type ViewStyle } from 'react-native'
import { textStyles } from './typography'

const S2 = 8
const S3 = 12

/**
 * Shared search field chrome – Platform.select previously omitted `web`, which
 * collapsed pill search bars on Expo web.
 */
export const searchFieldWrapperStyle: ViewStyle = Platform.select({
  ios: { paddingVertical: S3 },
  android: { paddingVertical: S2, minHeight: 44 },
  web: { paddingVertical: S3, minHeight: 44 },
  default: { paddingVertical: S3, minHeight: 44 },
}) as ViewStyle

export const searchFieldInputStyle: TextStyle = {
  flex: 1,
  minWidth: 0,
  ...textStyles.textInputMedium,
  ...Platform.select({
    ios: { paddingVertical: 0 },
    android: { paddingVertical: 0, includeFontPadding: false },
    web: {
      paddingVertical: 0,
      minHeight: 22,
      lineHeight: 22,
      outlineStyle: 'none',
    },
    default: { paddingVertical: 0 },
  }),
}

/** Search row inside recipient dropdown sheets (currency, provider, etc.). */
export const dropdownSearchRowStyle: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: S3,
  paddingVertical: S2,
  gap: S2,
  ...Platform.select({
    web: { minHeight: 44 },
    default: {},
  }),
}

export const dropdownSearchInputStyle: TextStyle = {
  flex: 1,
  minWidth: 0,
  ...textStyles.textInputMedium,
  paddingVertical: 0,
  ...Platform.select({
    android: { includeFontPadding: false, textAlignVertical: 'center' },
    web: {
      minHeight: 22,
      lineHeight: 22,
      outlineStyle: 'none',
    },
    default: {},
  }),
}
