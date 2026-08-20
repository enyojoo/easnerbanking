import React, { useEffect, useState } from 'react'
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useThemeColors } from '../contexts/ThemePaletteContext'
import { borderRadius, spacing } from '../theme'
import { useWebCenteredModal, webCenteredModalStyles } from '../lib/webCenteredModal'

type WebAwareModalProps = {
  visible: boolean
  onRequestClose: () => void
  children: React.ReactNode
  animationType?: 'none' | 'slide' | 'fade'
  keyboardAvoiding?: boolean
  nativePanelStyle?: StyleProp<ViewStyle>
  webPanelStyle?: StyleProp<ViewStyle>
  compact?: boolean
}

/**
 * Bottom sheet on native; centered dialog on Expo web (business parity).
 *
 * Do not put `onStartShouldSetResponder` on the panel – that steals the
 * responder from nested ScrollView / FlatList and blocks scrolling.
 */
export function WebAwareModal({
  visible,
  onRequestClose,
  children,
  animationType,
  keyboardAvoiding = false,
  nativePanelStyle,
  webPanelStyle,
  compact = false,
}: WebAwareModalProps) {
  const palette = useThemeColors()
  const useCenteredModal = useWebCenteredModal()
  const resolvedAnimation = animationType ?? (useCenteredModal ? 'fade' : 'slide')
  const [keyboardBottom, setKeyboardBottom] = useState(0)

  useEffect(() => {
    if (!keyboardAvoiding || !visible) {
      setKeyboardBottom(0)
      return
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const onShow = Keyboard.addListener(showEvent, (e) => {
      setKeyboardBottom(e.endCoordinates?.height ?? 0)
    })
    const onHide = Keyboard.addListener(hideEvent, () => setKeyboardBottom(0))
    return () => {
      onShow.remove()
      onHide.remove()
    }
  }, [keyboardAvoiding, visible])

  if (!visible) return null

  if (useCenteredModal) {
    return (
      <Modal
        visible
        transparent
        animationType={resolvedAnimation}
        onRequestClose={onRequestClose}
        statusBarTranslucent
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
              compact && webCenteredModalStyles.panelCompact,
              styles.webPanel,
              {
                backgroundColor: palette.background.primary,
                borderColor: palette.border.default,
              },
              webPanelStyle,
            ]}
          >
            {children}
          </View>
        </View>
      </Modal>
    )
  }

  const keyboardPanelStyle: ViewStyle | undefined =
    keyboardAvoiding && keyboardBottom > 0 ? { marginBottom: keyboardBottom } : undefined

  return (
    <Modal
      visible
      transparent
      animationType={resolvedAnimation}
      onRequestClose={onRequestClose}
      statusBarTranslucent
    >
      <View style={styles.nativeOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} />
        <View
          style={[
            styles.nativePanel,
            { backgroundColor: palette.background.primary },
            keyboardPanelStyle,
            nativePanelStyle,
          ]}
        >
          {children}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  nativeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  nativePanel: {
    flexDirection: 'column',
    borderTopLeftRadius: borderRadius['3xl'],
    borderTopRightRadius: borderRadius['3xl'],
    paddingTop: spacing[2],
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: { elevation: 16 },
    }),
  },
  webPanel: {
    flexDirection: 'column',
    maxHeight: '88%',
    overflow: 'hidden',
    width: '100%',
  },
})
