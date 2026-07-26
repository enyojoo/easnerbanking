import React, { useMemo } from 'react'
import { View, Text, Pressable, Platform, StyleSheet, ViewStyle } from 'react-native'
import { ArrowLeft } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import { textStyles, spacing, fontFamily, useThemeColors } from '../theme'
import type { Colors } from '../theme/colors'
import { ripple } from '../lib/androidRipple'
import { haptics } from '../lib/haptics'
import { navigateStackBack } from '../navigation/stackBackNavigation'

interface InternalHeaderProps {
  title: string
  subtitle?: string
  onBack?: () => void
  rightAction?: {
    label: string
    onPress: () => void
    icon?: React.ReactNode
  }
  style?: ViewStyle
}

export default function InternalHeader({
  title,
  subtitle,
  onBack,
  rightAction,
  style,
}: InternalHeaderProps) {
  const navigation = useNavigation()
  const palette = useThemeColors()
  const styles = useMemo(() => createStyles(palette), [palette])

  const handleBack = async () => {
    haptics.tap()
    if (onBack) {
      onBack()
    } else {
      navigateStackBack(navigation)
    }
  }

  return (
    <View style={[styles.header, style]}>
      <Pressable
        onPress={handleBack}
        hitSlop={8}
        style={({ pressed }) => [
          styles.backButton,
          pressed && Platform.OS === 'ios' && styles.hitPressedIOS,
        ]}
        android_ripple={ripple.neutral}
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <ArrowLeft size={20} color={palette.primary.main} strokeWidth={2.25} />
      </Pressable>
      <View style={styles.headerContent}>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} accessibilityRole="text" numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {rightAction && (
        <Pressable
          onPress={rightAction.onPress}
          style={({ pressed }) => [
            styles.rightAction,
            pressed && Platform.OS === 'ios' && styles.hitPressedIOS,
          ]}
          android_ripple={ripple.neutral}
          accessibilityLabel={rightAction.label}
          accessibilityRole="button"
        >
          {rightAction.icon || (
            <Text style={styles.rightActionText}>{rightAction.label}</Text>
          )}
        </Pressable>
      )}
    </View>
  )
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing[5],
      paddingTop: spacing[4],
      paddingBottom: spacing[3],
      gap: spacing[3],
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.semantic.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerContent: {
      flex: 1,
    },
    title: {
      ...textStyles.headlineMedium,
      color: c.text.primary,
      fontFamily: fontFamily.semibold,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    subtitle: {
      ...textStyles.bodySmall,
      color: c.text.secondary,
      marginTop: 2,
    },
    rightAction: {
      paddingHorizontal: spacing[3],
      paddingVertical: spacing[2],
    },
    rightActionText: {
      ...textStyles.labelMedium,
      color: c.primary.main,
      fontFamily: fontFamily.semibold,
      fontWeight: '600',
    },
    hitPressedIOS: {
      opacity: 0.7,
    },
  })
}





















