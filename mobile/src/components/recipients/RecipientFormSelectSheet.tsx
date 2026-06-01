import React from 'react'
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, spacing, borderRadius } from '../../theme'
import { ripple } from '../../lib/androidRipple'

type RecipientFormSelectSheetProps = {
  visible: boolean
  onClose: () => void
  children: React.ReactNode
  /** Extra bottom inset when the software keyboard is open (px). */
  keyboardBottom?: number
}

function SheetBody({
  onClose,
  keyboardBottom = 0,
  children,
}: {
  onClose: () => void
  keyboardBottom?: number
  children: React.ReactNode
}) {
  const insets = useSafeAreaInsets()
  const bottomPad = Math.max(insets.bottom, spacing[3]) + keyboardBottom

  return (
    <View style={styles.host}>
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close menu"
      />
      <View style={[styles.sheetWrap, { paddingBottom: bottomPad }]}>
        <Pressable
          android_ripple={ripple.neutral}
          style={styles.sheet}
          onPress={(e) => e.stopPropagation()}
        >
          {children}
        </Pressable>
      </View>
    </View>
  )
}

/**
 * Bottom-anchored picker presented in a root RN Modal so it layers above
 * the add-recipient sheet (embedded overlays inside another Modal often do not paint).
 */
export default function RecipientFormSelectSheet({
  visible,
  onClose,
  children,
  keyboardBottom = 0,
}: RecipientFormSelectSheetProps) {
  if (!visible) return null

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <SheetBody onClose={onClose} keyboardBottom={keyboardBottom}>
        {children}
      </SheetBody>
    </Modal>
  )
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  sheetWrap: {
    paddingHorizontal: spacing[5],
    maxHeight: '58%',
  },
  sheet: {
    borderWidth: 1,
    borderColor: colors.frame.border,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.primary,
    overflow: 'hidden',
    maxHeight: 320,
    ...Platform.select({
      ios: {
        shadowColor: colors.neutral.black,
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 24 },
    }),
  },
})
