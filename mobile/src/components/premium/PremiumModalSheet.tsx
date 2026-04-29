import React from 'react'
import { Modal, View, StyleSheet, Pressable, type ModalProps } from 'react-native'
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
        <View
          style={[
            styles.sheet,
            { backgroundColor: palette.semantic.card, borderColor: palette.border.default },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: palette.border.default }]} />
          {children}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  sheet: {
    borderTopLeftRadius: borderRadius['3xl'],
    borderTopRightRadius: borderRadius['3xl'],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    paddingBottom: spacing[6],
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: borderRadius.full,
    alignSelf: 'center',
    marginBottom: spacing[4],
  },
})

