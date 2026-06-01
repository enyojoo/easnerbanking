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
  /**
   * When true, render inside the add-recipient modal (no nested RN Modal).
   * Nested modals do not receive touches reliably on iOS/Android.
   */
  embedded?: boolean
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
    <View style={styles.host} pointerEvents="box-none">
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close menu"
      />
      <View style={[styles.sheetWrap, { paddingBottom: bottomPad }]} pointerEvents="box-none">
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
 * Bottom-anchored picker for add-recipient dropdowns: tap outside to dismiss,
 * keyboard-aware padding, no selection required to close.
 */
export default function RecipientFormSelectSheet({
  visible,
  onClose,
  children,
  keyboardBottom = 0,
  embedded = false,
}: RecipientFormSelectSheetProps) {
  if (!visible) return null

  if (embedded) {
    return (
      <View style={styles.embeddedHost} pointerEvents="box-none">
        <SheetBody onClose={onClose} keyboardBottom={keyboardBottom}>
          {children}
        </SheetBody>
      </View>
    )
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SheetBody onClose={onClose} keyboardBottom={keyboardBottom}>
        {children}
      </SheetBody>
    </Modal>
  )
}

const styles = StyleSheet.create({
  embeddedHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9000,
    ...Platform.select({
      android: { elevation: 9000 },
    }),
  },
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
