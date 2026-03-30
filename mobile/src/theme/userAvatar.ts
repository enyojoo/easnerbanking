import { StyleSheet } from 'react-native'
import { colors } from './colors'

/** Shared size for profile placeholder circles (dashboard header, etc.) */
export const USER_AVATAR_SIZE = 40

/** Slightly larger circle on Profile edit only (initials styling matches `userAvatarStyles.initials`). */
export const PROFILE_EDIT_AVATAR_SIZE = 56

export const userAvatarStyles = StyleSheet.create({
  circle: {
    width: USER_AVATAR_SIZE,
    height: USER_AVATAR_SIZE,
    borderRadius: USER_AVATAR_SIZE / 2,
    backgroundColor: colors.frame.background,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  initials: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary.main,
    fontFamily: 'Outfit-Bold',
  },
})
