import React, { useEffect, useMemo } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { MessageCircle } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { navigateFromRoot } from '../../navigation/rootNavigationRef'
import { useAuth } from '../../contexts/AuthContext'
import { useThemeColors } from '../../contexts/ThemePaletteContext'
import { HEADER_HEIGHT, spacing, userAvatarStyles } from '../../theme'
import { AvatarImage } from '../AvatarImage'
import { initialsFromFullName } from '../../lib/userProfileHelpers'
import { avatarImageUri, warmAvatarCache } from '../../lib/avatarCache'
import { haptics } from '../../lib/haptics'
import { ripple } from '../../lib/androidRipple'
import { analytics } from '../../lib/analytics'
import { intercomPresentErrorMessage, presentIntercomMessenger } from '../../lib/intercom'

export function DesktopHeader() {
  const palette = useThemeColors()
  const insets = useSafeAreaInsets()
  const { user, userProfile } = useAuth()
  const styles = useMemo(() => createStyles(palette), [palette])

  // Same name resolution as DashboardScreen header avatar
  const avatarFullName =
    userProfile?.profile?.full_name ||
    [userProfile?.profile?.first_name, userProfile?.profile?.last_name].filter(Boolean).join(' ') ||
    user?.full_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    ''
  const headerAvatarUri = avatarImageUri(userProfile?.profile?.avatar_url)

  useEffect(() => {
    warmAvatarCache(headerAvatarUri)
  }, [headerAvatarUri])

  return (
    <View style={[styles.header, { paddingTop: insets.top > 0 ? 0 : spacing[2] }]}>
      <View style={styles.spacer} />
      <View style={styles.actions}>
        <Pressable
          style={styles.supportButton}
          onPress={() => {
            haptics.tap()
            analytics.trackSupportLiveChatOpened()
            void presentIntercomMessenger().catch((e) => {
              Alert.alert('Live chat', intercomPresentErrorMessage(e))
            })
          }}
          android_ripple={ripple.neutral}
          accessibilityRole="button"
          accessibilityLabel="Support chat"
        >
          <MessageCircle size={22} color={palette.primary.main} strokeWidth={2} />
        </Pressable>
        <Pressable
          style={styles.avatarButton}
          onPress={() => {
            haptics.tap()
            navigateFromRoot('Profile')
          }}
          android_ripple={ripple.neutral}
          accessibilityRole="button"
          accessibilityLabel="Profile"
        >
          {headerAvatarUri ? (
            <AvatarImage
              avatarUrl={userProfile?.profile?.avatar_url}
              style={userAvatarStyles.image}
            />
          ) : (
            <Text style={userAvatarStyles.initials}>
              {initialsFromFullName(avatarFullName)}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  )
}

function createStyles(palette: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    header: {
      height: HEADER_HEIGHT,
      minHeight: HEADER_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingHorizontal: spacing[8],
      backgroundColor: palette.semantic.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.border.default,
      flexShrink: 0,
    },
    spacer: {
      flex: 1,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[2],
    },
    /** Matches DashboardScreen `supportHeaderButton`. */
    supportButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: palette.semantic.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.border.default,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    /** Matches DashboardScreen `headerAvatarButton`. */
    avatarButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      overflow: 'hidden',
      flexShrink: 0,
      backgroundColor: palette.semantic.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.border.default,
      justifyContent: 'center',
      alignItems: 'center',
    },
  })
}
