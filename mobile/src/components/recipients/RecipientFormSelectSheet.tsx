import React from 'react'
import { Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, spacing, borderRadius } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { useWebCenteredModal, webCenteredModalStyles } from '../../lib/webCenteredModal'

type DropdownAnchor = {
  x: number
  y: number
  width: number
  height: number
}

type RecipientFormSelectSheetProps = {
  visible: boolean
  onClose: () => void
  children: React.ReactNode
  anchor?: DropdownAnchor | null
  /** Extra bottom inset when the software keyboard is open (px). */
  keyboardBottom?: number
}

function SheetBody({
  onClose,
  keyboardBottom = 0,
  anchor,
  children,
}: {
  onClose: () => void
  keyboardBottom?: number
  anchor?: DropdownAnchor | null
  children: React.ReactNode
}) {
  const useCenteredModal = useWebCenteredModal()
  const insets = useSafeAreaInsets()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const horizontalInset = spacing[5]
  const dropdownTop = anchor ? anchor.y + anchor.height + spacing[1] : undefined
  const dropdownLeft = anchor
    ? Math.max(horizontalInset, Math.min(anchor.x, windowWidth - anchor.width - horizontalInset))
    : horizontalInset
  const dropdownWidth = anchor
    ? Math.min(anchor.width, windowWidth - horizontalInset * 2)
    : windowWidth - horizontalInset * 2
  const bottomLimit = windowHeight - Math.max(insets.bottom, spacing[3]) - keyboardBottom - spacing[3]
  const dropdownMaxHeight = anchor
    ? Math.max(140, Math.min(320, bottomLimit - (dropdownTop ?? 0)))
    : 320

  if (useCenteredModal) {
    return (
      <View style={webCenteredModalStyles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
        />
        <Pressable
          android_ripple={ripple.neutral}
          style={[
            webCenteredModalStyles.panel,
            webCenteredModalStyles.panelCompact,
            styles.webPickerPanel,
            { maxHeight: 360, backgroundColor: colors.background.primary, borderColor: colors.frame.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {children}
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.host}>
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close menu"
      />
      <View
        style={[
          styles.dropdownWrap,
          anchor
            ? {
                top: dropdownTop,
                left: dropdownLeft,
                width: dropdownWidth,
                maxHeight: dropdownMaxHeight,
              }
            : {
                left: horizontalInset,
                right: horizontalInset,
                bottom: Math.max(insets.bottom, spacing[3]) + keyboardBottom,
                maxHeight: dropdownMaxHeight,
              },
        ]}
      >
        <Pressable
          android_ripple={ripple.neutral}
          style={[styles.dropdown, { maxHeight: dropdownMaxHeight }]}
          onPress={(e) => e.stopPropagation()}
        >
          {children}
        </Pressable>
      </View>
    </View>
  )
}

/**
 * Field-anchored picker presented in a root RN Modal so it layers above
 * the add-recipient sheet (embedded overlays inside another Modal often do not paint).
 */
export default function RecipientFormSelectSheet({
  visible,
  onClose,
  children,
  anchor = null,
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
      <SheetBody onClose={onClose} keyboardBottom={keyboardBottom} anchor={anchor}>
        {children}
      </SheetBody>
    </Modal>
  )
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'transparent',
  },
  dropdownWrap: {
    position: 'absolute',
  },
  dropdown: {
    borderWidth: 1,
    borderColor: colors.frame.border,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.primary,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: colors.neutral.black,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
      },
      android: { elevation: 24 },
    }),
  },
  webPickerPanel: {
    width: '100%',
    overflow: 'hidden',
  },
})
