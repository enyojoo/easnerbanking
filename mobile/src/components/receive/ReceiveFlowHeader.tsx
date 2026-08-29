import React from 'react'
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native'
import { ArrowLeft } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import { colors, spacing, textStyles, surfaceChromeCircleStyle } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'
import { navigateStackBack } from '../../navigation/stackBackNavigation'

type ReceiveFlowHeaderProps = {
  title: string
  onBack?: () => void
  right?: React.ReactNode
  style?: ViewStyle
}

export function ReceiveFlowHeader({ title, onBack, right, style }: ReceiveFlowHeaderProps) {
  const navigation = useNavigation()

  const handleBack = () => {
    if (onBack) {
      onBack()
      return
    }
    navigateStackBack(navigation)
  }

  return (
    <View style={[styles.header, style]}>
      <View style={styles.headerTopRow}>
        <Pressable
          android_ripple={ripple.neutral}
          onPress={() => {
            haptics.tap()
            handleBack()
          }}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={colors.primary.main} strokeWidth={2} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.title}>{title}</Text>
          {right}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    ...surfaceChromeCircleStyle(colors, 44),
    marginRight: spacing[3],
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...textStyles.headlineMedium,
    color: colors.text.primary,
    marginBottom: 2,
  },
})
