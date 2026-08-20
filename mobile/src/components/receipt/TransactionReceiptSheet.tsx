import React, { useRef } from 'react'
import {
  Modal,
  View,
  Text,
  Pressable,
  Platform,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native'
import type { View as RNView } from 'react-native'
import { Download, Share2, X } from 'lucide-react-native'
import { TransactionReceiptCard } from './TransactionReceiptCard'
import type { ReceiptDetails } from './receipt-types'
import { useSaveTransactionReceipt } from '../../hooks/useSaveTransactionReceipt'
import { ModalToastHost } from '../ToastProvider'
import { colors, spacing, borderRadius, textStyles, fontFamily, shadows } from '../../theme'
import { ripple } from '../../lib/androidRipple'
import { useWebCenteredModal } from '../../lib/webCenteredModal'

export type { ReceiptDetails, ReceiptRow } from './receipt-types'

type Props = {
  visible: boolean
  onClose: () => void
  receipt: ReceiptDetails | null
}

/**
 * Receipt preview + share/save sheet – the Wise/Revolut pattern: the user sees the branded
 * receipt before acting. Primary "Share receipt" opens the native share sheet (which itself
 * includes Save to Photos/Files); secondary "Save to Photos" writes directly to the camera roll.
 * Rendering the card visibly here (vs off-screen) also makes the capture far more reliable.
 */
export function TransactionReceiptSheet({ visible, onClose, receipt }: Props) {
  const useCenteredModal = useWebCenteredModal()
  const receiptRef = useRef<RNView | null>(null)
  const { pendingAction, saveToPhotos, shareReceipt } = useSaveTransactionReceipt(receiptRef, receipt)
  const isBusy = pendingAction !== null

  const cardWidth = Math.min(Dimensions.get('window').width - spacing[6] * 2, 400)

  return (
    <Modal
      visible={visible}
      animationType={useCenteredModal ? 'fade' : 'slide'}
      transparent
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, useCenteredModal && styles.backdropWeb]}>
        <View style={[styles.sheet, useCenteredModal && styles.sheetWeb]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Receipt</Text>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              android_ripple={ripple.neutral}
              style={({ pressed }) => pressed && Platform.OS === 'ios' && styles.iconPressedIOS}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={22} color={colors.text.primary} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.previewScroll}
            showsVerticalScrollIndicator={false}
          >
            {receipt ? (
              <View style={styles.previewShadow}>
                <TransactionReceiptCard
                  ref={receiptRef}
                  width={cardWidth}
                  title={receipt.title}
                  amountText={receipt.amountText}
                  isCredit={receipt.isCredit}
                  statusLabel={receipt.statusLabel}
                  outcome={receipt.outcome}
                  dateText={receipt.dateText}
                  rows={receipt.rows}
                  transactionId={receipt.transactionId}
                />
              </View>
            ) : null}
          </ScrollView>

          {/* Side-by-side, equal weight: the user explicitly picks Share or Save – nothing
              is ever saved or shared automatically. */}
          <View style={styles.actions}>
            <Pressable
              android_ripple={ripple.neutral}
              disabled={isBusy}
              style={({ pressed }) => [
                styles.action,
                pressed && Platform.OS === 'ios' && !isBusy && styles.actionPressedIOS,
                isBusy && styles.disabled,
              ]}
              onPress={() => void saveToPhotos()}
              accessibilityRole="button"
              accessibilityLabel="Save to Photos"
            >
              {pendingAction === 'save' ? (
                <ActivityIndicator color={colors.primary.main} />
              ) : (
                <>
                  <Download size={18} color={colors.primary.main} strokeWidth={2.25} />
                  <Text style={styles.actionText}>Save</Text>
                </>
              )}
            </Pressable>

            <Pressable
              android_ripple={ripple.neutral}
              disabled={isBusy}
              style={({ pressed }) => [
                styles.action,
                pressed && Platform.OS === 'ios' && !isBusy && styles.actionPressedIOS,
                isBusy && styles.disabled,
              ]}
              onPress={() => void shareReceipt()}
              accessibilityRole="button"
              accessibilityLabel="Share receipt"
            >
              {pendingAction === 'share' ? (
                <ActivityIndicator color={colors.primary.main} />
              ) : (
                <>
                  <Share2 size={18} color={colors.primary.main} strokeWidth={2.25} />
                  <Text style={styles.actionText}>Share</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
        {/* Re-hosts toasts inside this Modal so "Receipt saved" appears above the
            sheet (a root overlay would be hidden behind the native Modal). */}
        <ModalToastHost />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  backdropWeb: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[6],
  },
  sheet: {
    backgroundColor: colors.background.primary,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing[6],
    paddingTop: spacing[5],
    paddingBottom: spacing[10],
    maxHeight: '90%',
  },
  sheetWeb: {
    width: '100%',
    maxWidth: 460,
    borderRadius: borderRadius['2xl'],
    paddingBottom: spacing[6],
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  sheetTitle: {
    ...textStyles.headlineSmall,
    color: colors.text.primary,
  },
  iconPressedIOS: {
    opacity: 0.7,
  },
  previewScroll: {
    alignItems: 'center',
    paddingBottom: spacing[5],
  },
  previewShadow: {
    borderRadius: borderRadius.xl,
    ...shadows.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    height: 52,
    borderRadius: borderRadius.full,
    backgroundColor: colors.semantic.card,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  actionPressedIOS: {
    opacity: 0.85,
  },
  actionText: {
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
    fontSize: 16,
  },
  disabled: {
    opacity: 0.6,
  },
})
