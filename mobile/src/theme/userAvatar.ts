import { Platform, StyleSheet } from 'react-native'
import { colors } from './colors'
import { fontFamily } from './typography'
import { surfaceChromeCircleStyle } from './surfaceFrame'

/** Shared size for profile placeholder circles (dashboard header, etc.) */
export const USER_AVATAR_SIZE = 40

/** Slightly larger circle on Profile edit only (initials styling matches `userAvatarStyles.initials`). */
export const PROFILE_EDIT_AVATAR_SIZE = 56

/** PIN entry / app lock – aligns with business web `h-16 w-16` (64px). */
export const PIN_ENTRY_AVATAR_SIZE = 64

export const userAvatarStyles = StyleSheet.create({
  circle: {
    ...surfaceChromeCircleStyle(colors, USER_AVATAR_SIZE, { shadow: 'none' }),
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  initials: {
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '700',
    color: colors.primary.main,
    fontFamily: fontFamily.bold,
    textAlign: 'center',
    ...Platform.select({
      android: { includeFontPadding: false, textAlignVertical: 'center' as const },
      default: {},
    }),
  },
  pinEntryCircle: {
    ...surfaceChromeCircleStyle(colors, PIN_ENTRY_AVATAR_SIZE, { shadow: 'none' }),
    marginBottom: 16,
    overflow: 'hidden',
  },
  pinEntryInitials: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '700',
    color: colors.primary.main,
    fontFamily: fontFamily.bold,
    textAlign: 'center',
    ...Platform.select({
      android: { includeFontPadding: false, textAlignVertical: 'center' as const },
      default: {},
    }),
  },
})
