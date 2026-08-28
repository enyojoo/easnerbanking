import React from 'react'
import { View, Text, Pressable } from 'react-native'
import { AtSign, Building2, Smartphone, Wallet, X } from 'lucide-react-native'
import { WebAwareModal } from '../WebAwareModal'
import { colors } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { haptics } from '../../lib/haptics'
import type { RecipientFormType } from '../../lib/recipientForm/recipientFormTypes'
import { recipientFormStyles as styles } from './recipientFormStyles'

type Props = {
  visible: boolean
  footerPadding: number
  hideEasenet?: boolean
  payrollMode?: boolean
  onClose: () => void
  onSelectType: (type: RecipientFormType) => void
}

export function RecipientTypePickerModal({
  visible,
  footerPadding,
  hideEasenet = false,
  payrollMode = false,
  onClose,
  onSelectType,
}: Props) {
  return (
    <WebAwareModal
      visible={visible}
      keyboardAvoiding
      compact
      onRequestClose={onClose}
      nativePanelStyle={[styles.recipientTypeModal, { paddingBottom: footerPadding }]}
    >
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>
          {payrollMode ? 'How do you want to receive payroll?' : 'Add a new'}
        </Text>
        <Pressable android_ripple={ripple.neutral} onPress={onClose} style={styles.closeButton}>
          <X size={24} color={colors.text.secondary} strokeWidth={2} />
        </Pressable>
      </View>

      <View style={styles.recipientTypeOptions}>
        <Pressable
          android_ripple={ripple.neutral}
          style={styles.recipientTypeOption}
          onPress={() => {
            haptics.tap()
            onSelectType('wallet')
          }}
        >
          <View style={styles.recipientTypeIcon}>
            <Wallet size={24} color={colors.primary.main} strokeWidth={2} />
          </View>
          <View style={styles.recipientTypeContent}>
            <Text style={styles.recipientTypeTitle}>Wallet Address</Text>
            <Text style={styles.recipientTypeSubtitle}>
              {payrollMode ? 'Receive stablecoins at a wallet address' : 'Send stablecoins to an address'}
            </Text>
          </View>
        </Pressable>

        <Pressable
          android_ripple={ripple.neutral}
          style={styles.recipientTypeOption}
          onPress={() => {
            haptics.tap()
            onSelectType('bank')
          }}
        >
          <View style={styles.recipientTypeIcon}>
            <Building2 size={24} color={colors.primary.main} strokeWidth={2} />
          </View>
          <View style={styles.recipientTypeContent}>
            <Text style={styles.recipientTypeTitle}>Bank Account</Text>
            <Text style={styles.recipientTypeSubtitle}>
              {payrollMode ? 'Receive payroll in a bank account' : 'Send cash to a bank account'}
            </Text>
          </View>
        </Pressable>

        <Pressable
          android_ripple={ripple.neutral}
          style={styles.recipientTypeOption}
          onPress={() => {
            haptics.tap()
            onSelectType('mobile')
          }}
        >
          <View style={styles.recipientTypeIcon}>
            <Smartphone size={24} color={colors.primary.main} strokeWidth={2} />
          </View>
          <View style={styles.recipientTypeContent}>
            <Text style={styles.recipientTypeTitle}>Mobile Money</Text>
            <Text style={styles.recipientTypeSubtitle}>
              {payrollMode ? 'Receive payroll via mobile money' : 'Send cash via mobile money'}
            </Text>
          </View>
        </Pressable>

        {!hideEasenet ? (
          <Pressable
            android_ripple={ripple.neutral}
            style={styles.recipientTypeOption}
            onPress={() => {
              haptics.tap()
              onSelectType('easenet')
            }}
          >
            <View style={styles.recipientTypeIcon}>
              <AtSign size={24} color={colors.primary.main} strokeWidth={2} />
            </View>
            <View style={styles.recipientTypeContent}>
              <Text style={styles.recipientTypeTitle}>Easetag</Text>
              <Text style={styles.recipientTypeSubtitle}>Send cash via Easner handle</Text>
            </View>
          </Pressable>
        ) : null}
      </View>
    </WebAwareModal>
  )
}
