import React, { useCallback } from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import { PressableScale } from 'pressto'
import type { LucideIcon } from 'lucide-react-native'
import { colors, textStyles, borderRadius, fontFamily } from '../../theme'
import { haptics } from '../../lib/haptics'

interface QuickActionButtonProps {
  icon: LucideIcon
  label: string
  onPress: () => void
  iconColor?: string
  iconBackground?: string
  style?: ViewStyle
}

export default function QuickActionButton({
  icon: Icon,
  label,
  onPress,
  iconColor = colors.primary.main,
  iconBackground = 'rgba(0, 122, 204, 0.10)',
  style,
}: QuickActionButtonProps) {
  const handlePress = useCallback(() => {
    haptics.tap()
    onPress()
  }, [onPress])

  return (
    <PressableScale style={[styles.container, style]} onPress={handlePress}>
      <View style={[styles.iconContainer, { backgroundColor: iconBackground }]}>
        <Icon size={22} color={iconColor} strokeWidth={2.25} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  label: {
    ...textStyles.labelMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    textAlign: 'center',
  },
})
