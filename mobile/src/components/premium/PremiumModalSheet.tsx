import React from 'react'
import { Modal, View, StyleSheet, Pressable, useWindowDimensions, type ModalProps } from 'react-native'
import { EaseView } from 'react-native-ease'
import { borderRadius, spacing, useThemeColors } from '../../theme'
import { useWebCenteredModal, webCenteredModalStyles } from '../../lib/webCenteredModal'

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
  const { height: screenHeight } = useWindowDimensions()
  const sheetOffset = Math.min(screenHeight * 0.45, 420)
  const useCenteredModal = useWebCenteredModal()

  if (useCenteredModal) {
    return (
      <Modal
        {...props}
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onRequestClose}
      >
        <View style={webCenteredModalStyles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onRequestClose}
            accessibilityRole="button"
            accessibilityLabel="Close dialog"
          />
          <View
            style={[
              webCenteredModalStyles.panel,
              {
                backgroundColor: palette.semantic.card,
                borderColor: palette.border.default,
              },
            ]}
          >
            {children}
          </View>
        </View>
      </Modal>
    )
  }

  return (
    <Modal
      {...props}
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onRequestClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} />
        <EaseView
          initialAnimate={{ translateY: sheetOffset }}
          animate={{ translateY: visible ? 0 : sheetOffset }}
          transition={{ type: 'spring', damping: 22, stiffness: 280 }}
          style={[
            styles.sheet,
            { backgroundColor: palette.semantic.card, borderColor: palette.border.default },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: palette.border.default }]} />
          {children}
        </EaseView>
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
