import React from 'react'
import { View, Text, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { X } from 'lucide-react-native'
import { WebAwareModal } from '../WebAwareModal'
import { EmbeddedWalletAddressQrScanner } from './WalletAddressQrScanner'
import { RecipientFormDropdownHost } from './RecipientFormDropdownHost'
import { CountryCurrencySelector, EasenetRecipientFields } from './EasenetRecipientFields'
import { MobileRecipientFields } from './MobileRecipientFields'
import { WalletRecipientFields } from './WalletRecipientFields'
import { BankRecipientFields } from './BankRecipientFields'
import { recipientFormModalTitle, recipientFormStyles as styles } from './recipientFormStyles'
import { colors, spacing } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import type { UseRecipientFormStateReturn } from '../../hooks/useRecipientFormState'

const getInitials = (name: string): string => {
  const parts = name.trim().split(' ')
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

type Props = {
  form: UseRecipientFormStateReturn
  footerPadding: number
  editing?: boolean
  onSubmit: () => void
  onClose: () => void
}

export function RecipientFormModal({ form, footerPadding, editing = false, onSubmit, onClose }: Props) {
  const insets = useSafeAreaInsets()

  const handleClose = () => {
    if (form.showWalletAddressScanner) {
      form.setShowWalletAddressScanner(false)
      return
    }
    onClose()
  }

  return (
    <WebAwareModal
      visible={form.showBankAccountForm}
      onRequestClose={() => {
        form.closeAllDropdowns()
        onClose()
      }}
      nativePanelStyle={{
        height: '92%',
        paddingBottom: footerPadding,
      }}
      webPanelStyle={{
        maxWidth: 560,
        maxHeight: '90%',
      }}
    >
      <RecipientFormDropdownHost>
        <View style={styles.modalFormBody}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editing
                ? 'Edit recipient'
                : recipientFormModalTitle(form.selectedRecipientType, form.showWalletAddressScanner)}
            </Text>
            <Pressable android_ripple={ripple.neutral} onPress={handleClose} style={styles.closeButton}>
              <X size={24} color={colors.text.secondary} strokeWidth={2} />
            </Pressable>
          </View>

          {form.showWalletAddressScanner && form.selectedRecipientType === 'wallet' ? (
            <EmbeddedWalletAddressQrScanner
              visible
              showHeader={false}
              onClose={() => form.setShowWalletAddressScanner(false)}
              onScan={(address) => {
                form.setNewRecipient((prev) => ({ ...prev, walletAddress: address }))
                form.applyWalletAddressInference(address)
                form.setShowWalletAddressScanner(false)
              }}
            />
          ) : (
            <>
              <KeyboardAwareScrollView
                ref={form.formScrollRef}
                style={styles.modalScrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.modalScrollContent, { paddingBottom: spacing[4] }]}
                nestedScrollEnabled
                scrollEnabled={!form.isAnyDropdownOpen}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                bottomOffset={insets.bottom + spacing[3]}
              >
                <View style={styles.modalContent}>
                  {form.error ? (
                    <View style={styles.errorContainer}>
                      <Text style={styles.errorText}>{form.error}</Text>
                    </View>
                  ) : null}

                  {form.selectedRecipientType === 'easenet' ? (
                    <EasenetRecipientFields form={form} getInitials={getInitials} />
                  ) : null}

                  {form.selectedRecipientType !== 'easenet' ? (
                    <CountryCurrencySelector form={form} />
                  ) : null}

                  {form.selectedRecipientType === 'mobile' ? <MobileRecipientFields form={form} /> : null}
                  {form.selectedRecipientType === 'wallet' ? <WalletRecipientFields form={form} /> : null}
                  {form.selectedRecipientType === 'bank' ? <BankRecipientFields form={form} /> : null}
                </View>
              </KeyboardAwareScrollView>

              <View style={styles.modalButtonsFooter}>
                <View style={styles.modalButtons}>
                  <Pressable
                    android_ripple={ripple.neutral}
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={onClose}
                    disabled={form.isSubmitting}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    android_ripple={ripple.neutral}
                    style={[
                      styles.modalButton,
                      styles.saveButton,
                      (form.isSubmitting || !form.isValid) && styles.disabledButton,
                    ]}
                    onPress={onSubmit}
                    disabled={form.isSubmitting || !form.isValid}
                  >
                    <Text style={styles.saveButtonText}>
                      {form.isSubmitting ? (editing ? 'Saving...' : 'Adding...') : editing ? 'Save' : 'Add'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </>
          )}
        </View>
      </RecipientFormDropdownHost>
    </WebAwareModal>
  )
}
