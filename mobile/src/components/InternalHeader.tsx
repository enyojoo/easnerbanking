import React from 'react'
import { View, Text, Pressable, Platform, StyleSheet, ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import * as Haptics from 'expo-haptics'
import { colors, shadows, textStyles, spacing } from '../theme'
import { ripple } from '../lib/androidRipple'

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

  const handleBack = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (onBack) {
      onBack()
    } else {
      navigation.goBack()
    }
  }

  return (
    <View style={[styles.header, style]}>
      <Pressable
        onPress={handleBack}
        style={({ pressed }) => [
          styles.backButton,
          pressed && Platform.OS === 'ios' && styles.hitPressedIOS,
        ]}
        android_ripple={ripple.neutral}
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
      </Pressable>
      <View style={styles.headerContent}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} accessibilityRole="text">
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

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
    gap: spacing[3],
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.neutral.white,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    ...textStyles.headlineLarge,
    color: colors.text.primary,
    marginBottom: spacing[1],
  },
  subtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  rightAction: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  rightActionText: {
    ...textStyles.labelMedium,
    color: colors.primary.main,
    fontFamily: 'Outfit-SemiBold',
  },
  hitPressedIOS: {
    opacity: 0.7,
  },
})






















