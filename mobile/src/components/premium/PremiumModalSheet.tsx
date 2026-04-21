import React from 'react'
import { Modal, View, StyleSheet, Pressable, type ModalProps } from 'react-native'
import { BlurView } from 'expo-blur'
import { borderRadius, spacing, useThemeColors } from '../../theme'

type PremiumModalSheetProps = ModalProps & {
  visible: boolean
  onRequestClose: () => void
  children: React.ReactNode
}

export default function PremiumModalSheet({
  visible,
  onRequestClose,
  children,
  ...props
}: PremiumModalSheetProps) {
  const palette = useThemeColors()

  return (
    <Modal
      {...props}
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onRequestClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} />
        <BlurView intensity={28} tint="light" style={styles.sheetBlur}>
          <View
            style={[
              styles.sheet,
              { backgroundColor: palette.glass.surface, borderColor: palette.glass.border },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: palette.border.default }]} />
            {children}
          </View>
        </BlurView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,17,16,0.18)',
  },
  sheetBlur: {
    borderTopLeftRadius: borderRadius['4xl'],
    borderTopRightRadius: borderRadius['4xl'],
    overflow: 'hidden',
  },
  sheet: {
    borderTopLeftRadius: borderRadius['4xl'],
    borderTopRightRadius: borderRadius['4xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    paddingBottom: spacing[6],
  },
  grabber: {
    width: 42,
    height: 5,
    borderRadius: borderRadius.full,
    alignSelf: 'center',
    marginBottom: spacing[4],
  },
})

