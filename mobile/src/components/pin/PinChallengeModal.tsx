import React from 'react'
import { View, Modal, StyleSheet } from 'react-native'
import { colors, borderRadius, spacing } from '../../theme'
import { PinChallengePanel } from './PinChallengePanel'

type Props = {
  visible: boolean
  userId: string
  onClose: () => void
  /** Called after PIN verified (caller should close modal). */
  onVerified: () => void
}

/**
 * Modal PIN challenge for sensitive actions (e.g. confirm send). Same keypad/dots/shake as unlock.
 */
export function PinChallengeModal({ visible, userId, onClose, onVerified }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <PinChallengePanel active={visible} userId={userId} onVerified={onVerified} onCancel={onClose} />
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
  },
  card: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: colors.semantic.background,
    borderRadius: borderRadius.xl,
    padding: spacing[5],
  },
})
