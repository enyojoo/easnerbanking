import React, { useCallback, useEffect, useRef } from 'react'
import { InteractionManager, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { X } from 'lucide-react-native'
import { RecipientTypeOptions } from '../../components/recipients/RecipientTypeOptions'
import { recipientFormStyles as formStyles } from '../../components/recipients/recipientFormStyles'
import { navigateStackBack } from '../../navigation/stackBackNavigation'
import { navigateToRecipientFormRail, type RecipientFormSharedParams } from '../../lib/navigateRecipientForm'
import { preloadRecipientFormRails } from '../../lib/preloadRecipientFormScreens'
import { useWebCenteredModal, webCenteredModalStyles } from '../../lib/webCenteredModal'
import { useWebStackScreenFocus } from '../../hooks/useWebStackScreenFocus'
import type { RecipientFormType } from '../../lib/recipientForm/recipientFormTypes'
import type { NavigationProps } from '../../types'
import { borderRadius, colors, shadows, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'
import { useFixedFooterPadding } from '../../hooks/useScrollBottomPadding'

export default function AddRecipientTypeScreen({ navigation, route }: NavigationProps) {
  const params = (route.params ?? {}) as RecipientFormSharedParams
  const centered = useWebCenteredModal()
  const footerPadding = useFixedFooterPadding(spacing[4])
  const { webFocusTargetProps } = useWebStackScreenFocus()
  const selectingRef = useRef(false)

  const dismiss = useCallback(() => {
    haptics.tap()
    navigateStackBack(navigation)
  }, [navigation])

  useFocusEffect(
    useCallback(() => {
      selectingRef.current = false
    }, []),
  )

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      preloadRecipientFormRails()
    })
    return () => task.cancel()
  }, [])

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined
    const onKeyDown = (event: { key?: string }) => {
      if (event.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKeyDown as EventListener)
    return () => window.removeEventListener('keydown', onKeyDown as EventListener)
  }, [dismiss])

  const selectType = (type: RecipientFormType) => {
    if (selectingRef.current) return
    selectingRef.current = true
    navigateToRecipientFormRail(navigation, type, params)
  }

  return (
    <View
      style={[styles.root, centered && styles.rootCentered]}
      accessibilityViewIsModal
    >
      {Platform.OS === 'web' ? (
        <View {...webFocusTargetProps} style={styles.webFocusSentinel} />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        style={[styles.backdrop, centered && styles.backdropDim]}
        onPress={dismiss}
      />
      <View
        style={[
          styles.panel,
          centered ? [webCenteredModalStyles.panel, styles.panelCentered] : styles.panelSheet,
          { paddingBottom: centered ? spacing[5] : footerPadding },
        ]}
      >
        {!centered ? <View style={styles.handle} accessibilityElementsHidden /> : null}
        <View style={formStyles.modalHeader}>
          <Text style={formStyles.modalTitle} accessibilityRole="header">
            Add a new
          </Text>
          <Pressable
            android_ripple={ripple.neutral}
            onPress={dismiss}
            style={formStyles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={24} color={colors.text.secondary} strokeWidth={2} />
          </Pressable>
        </View>
        <RecipientTypeOptions onSelectType={selectType} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  rootCentered: {
    justifyContent: 'center',
    padding: spacing[6],
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropDim: {
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  panel: {
    backgroundColor: colors.background.primary,
    overflow: 'hidden',
    ...shadows.lg,
  },
  panelSheet: {
    borderTopLeftRadius: borderRadius['3xl'],
    borderTopRightRadius: borderRadius['3xl'],
    paddingTop: spacing[2],
  },
  panelCentered: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    backgroundColor: colors.background.primary,
    borderColor: colors.frame.border,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.light,
    marginTop: spacing[2],
  },
  webFocusSentinel: {
    position: 'absolute',
    width: 0,
    height: 0,
    overflow: 'hidden',
    opacity: 0,
  },
})
