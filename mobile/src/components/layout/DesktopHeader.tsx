import React, { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronDown, LogOut, User } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../contexts/AuthContext'
import { useThemeColors } from '../../contexts/ThemePaletteContext'
import { HEADER_HEIGHT, spacing, textStyles, userAvatarStyles } from '../../theme'
import { AvatarImage } from '../AvatarImage'
import { initialsFromFullName } from '../../lib/userProfileHelpers'
import { avatarImageUri } from '../../lib/avatarCache'
import { haptics } from '../../lib/haptics'
import { ripple } from '../../lib/androidRipple'

export function DesktopHeader() {
  const palette = useThemeColors()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation()
  const { userProfile, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  const fullName = userProfile?.profile?.full_name || userProfile?.profile?.name || ''
  const avatarUri = avatarImageUri(userProfile?.profile?.avatar_url)
  const styles = useMemo(() => createStyles(palette), [palette])

  const navigateTo = (route: string) => {
    setMenuOpen(false)
    const parent = navigation.getParent?.()
    if (parent?.navigate) {
      parent.navigate(route as never)
    } else {
      navigation.navigate(route as never)
    }
  }

  return (
    <View style={[styles.header, { paddingTop: insets.top > 0 ? 0 : spacing[2] }]}>
      <View style={styles.spacer} />
      <View style={styles.menuAnchor}>
        <Pressable
          style={styles.profileButton}
          onPress={() => {
            haptics.tap()
            setMenuOpen((v) => !v)
          }}
          android_ripple={ripple.neutral}
          accessibilityRole="button"
          accessibilityLabel="Account menu"
        >
          {avatarUri ? (
            <AvatarImage avatarUrl={userProfile?.profile?.avatar_url} style={userAvatarStyles.image} />
          ) : (
            <Text style={userAvatarStyles.initials}>{initialsFromFullName(fullName)}</Text>
          )}
          <Text style={styles.profileName} numberOfLines={1}>
            {fullName || 'Account'}
          </Text>
          <ChevronDown size={16} color={palette.text.secondary} strokeWidth={2} />
        </Pressable>

        {menuOpen ? (
          <View style={styles.dropdown}>
            <Pressable
              style={styles.dropdownItem}
              onPress={() => {
                haptics.tap()
                navigateTo('Profile')
              }}
              android_ripple={ripple.neutral}
            >
              <User size={18} color={palette.text.primary} strokeWidth={2} />
              <Text style={styles.dropdownLabel}>Profile</Text>
            </Pressable>
            <Pressable
              style={styles.dropdownItem}
              onPress={() => {
                haptics.tap()
                void signOut()
              }}
              android_ripple={ripple.neutral}
            >
              <LogOut size={18} color={palette.error.main} strokeWidth={2} />
              <Text style={[styles.dropdownLabel, { color: palette.error.main }]}>Sign out</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  )
}

function createStyles(palette: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    header: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: HEADER_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing[6],
      backgroundColor: palette.semantic.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.border.default,
      zIndex: 30,
    },
    spacer: {
      flex: 1,
    },
    menuAnchor: {
      position: 'relative',
    },
    profileButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[2],
      paddingVertical: spacing[2],
      paddingHorizontal: spacing[3],
      borderRadius: spacing[4],
    },
    profileName: {
      ...textStyles.titleSmall,
      color: palette.text.primary,
      maxWidth: 160,
    },
    dropdown: {
      position: 'absolute',
      top: HEADER_HEIGHT - spacing[2],
      right: 0,
      minWidth: 180,
      backgroundColor: palette.semantic.card,
      borderRadius: spacing[3],
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.border.default,
      paddingVertical: spacing[1],
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 4,
    },
    dropdownItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[3],
      paddingVertical: spacing[3],
      paddingHorizontal: spacing[4],
    },
    dropdownLabel: {
      ...textStyles.bodyMedium,
      color: palette.text.primary,
    },
  })
}
