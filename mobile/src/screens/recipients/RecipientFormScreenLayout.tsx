import React from 'react'
import { View, Text, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft } from 'lucide-react-native'
import ScreenWrapper from '../../components/ScreenWrapper'
import KeyboardAwareScreen from '../../components/KeyboardAwareScreen'
import { RecipientFormDropdownHost } from '../../components/recipients/RecipientFormDropdownHost'
import { recipientFormStyles as styles } from '../../components/recipients/recipientFormStyles'
import { colors, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'
import { useFixedFooterPadding } from '../../hooks/useScrollBottomPadding'
import { useResponsiveLayout } from '../../contexts/ResponsiveLayoutContext'
import { WEB_FLOW_MAX_WIDTH } from '../../components/layout/CenteredWebFlowPage'

type Props = {
  title: string
  error?: string
  submitting: boolean
  submitDisabled: boolean
  submitLabel: string
  submittingLabel: string
  scrollEnabled?: boolean
  formScrollRef?: React.ComponentProps<typeof KeyboardAwareScreen>['ref']
  onBack: () => void
  onCancel: () => void
  onSubmit: () => void
  children: React.ReactNode
}

export function RecipientFormScreenLayout({
  title,
  error,
  submitting,
  submitDisabled,
  submitLabel,
  submittingLabel,
  scrollEnabled = true,
  formScrollRef,
  onBack,
  onCancel,
  onSubmit,
  children,
}: Props) {
  const insets = useSafeAreaInsets()
  const footerPadding = useFixedFooterPadding(spacing[4])
  const { isWeb, mode } = useResponsiveLayout()
  const webColumn = isWeb && (mode === 'tablet' || mode === 'desktop')

  return (
    <ScreenWrapper>
      <RecipientFormDropdownHost>
        <View
          style={[
            styles.modalFormBody,
            webColumn ? { maxWidth: WEB_FLOW_MAX_WIDTH, width: '100%', alignSelf: 'center' } : null,
          ]}
        >
          <View style={styles.modalHeader}>
            <Pressable
              android_ripple={ripple.neutral}
              onPress={() => {
                haptics.tap()
                onBack()
              }}
              style={styles.flowBackButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ArrowLeft size={22} color={colors.primary.main} strokeWidth={2} />
            </Pressable>
            <Text style={[styles.modalTitle, styles.flowHeaderTitle]} numberOfLines={1}>
              {title}
            </Text>
          </View>

          <KeyboardAwareScreen
            ref={formScrollRef}
            style={styles.modalScrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.modalScrollContent, { paddingBottom: spacing[4] }]}
            nestedScrollEnabled
            scrollEnabled={scrollEnabled}
            keyboardDismissMode="interactive"
            bottomOffset={insets.bottom + spacing[3]}
          >
            <View style={styles.modalContent}>
              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
              {children}
            </View>
          </KeyboardAwareScreen>

          <View style={[styles.modalButtonsFooter, { paddingBottom: footerPadding }]}>
            <View style={styles.modalButtons}>
              <Pressable
                android_ripple={ripple.neutral}
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  haptics.tap()
                  onCancel()
                }}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                android_ripple={ripple.neutral}
                style={[
                  styles.modalButton,
                  styles.saveButton,
                  (submitting || submitDisabled) && styles.disabledButton,
                ]}
                onPress={onSubmit}
                disabled={submitting || submitDisabled}
                accessibilityRole="button"
                accessibilityLabel={submitting ? submittingLabel : submitLabel}
              >
                <Text style={styles.saveButtonText}>{submitting ? submittingLabel : submitLabel}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </RecipientFormDropdownHost>
    </ScreenWrapper>
  )
}
