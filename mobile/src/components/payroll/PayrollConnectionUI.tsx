import React, { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  Building2,
  Check,
  ChevronRight,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
  Wallet,
  X,
} from 'lucide-react-native'
import { WebAwareModal } from '../WebAwareModal'
import { CachedImage } from '../CachedImage'
import { StatusPill } from '../ui'
import { borderRadius, colors, fontFamily, spacing, textStyles } from '../../theme'
import type { PayrollConnectionSummary, PayrollMethodSummary } from '../../features/payroll/types'
import { payrollMethodDescription, payrollMethodTitle } from '../../features/payroll/types'

function MethodIcon({ type, size = 20 }: { type: PayrollMethodSummary['type']; size?: number }) {
  const props = { size, color: colors.primary.main }
  if (type === 'mobile_money') return <Smartphone {...props} />
  if (type === 'stablecoin') return <Wallet {...props} />
  return <Building2 {...props} />
}

export function PayrollBusinessIdentityCard({
  connection,
  readinessStatus,
}: {
  connection: PayrollConnectionSummary
  readinessStatus?: string | null
}) {
  return (
    <View style={styles.identityCard}>
      <View style={styles.identityTop}>
        {connection.businessLogoUrl ? (
          <CachedImage uri={connection.businessLogoUrl} style={styles.businessLogo} contentFit="cover" />
        ) : (
          <View style={styles.businessIcon}>
            <Building2 size={23} color={colors.primary.main} />
          </View>
        )}
        <View style={styles.grow}>
          <Text style={styles.businessName}>{connection.businessName}</Text>
          {connection.businessEasetag ? (
            <Text style={styles.muted}>@{connection.businessEasetag.replace(/^@/, '')}</Text>
          ) : null}
        </View>
        <StatusPill label={connection.status} tone={connection.status === 'approved' ? 'completed' : 'neutral'} />
      </View>
      <View style={styles.identityMeta}>
        <View style={styles.inline}>
          <ShieldCheck size={16} color={connection.businessVerified ? colors.success.main : colors.text.secondary} />
          <Text style={styles.muted}>{connection.businessVerified ? 'Verified business' : 'Verification pending'}</Text>
        </View>
        {readinessStatus ? (
          <Text style={styles.muted}>
            {readinessStatus === 'ready' ? 'Ready for payroll' : 'Receiving method needs attention'}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

export function PayrollCurrentMethodCard({
  method,
  onChange,
  disabled = false,
}: {
  method: PayrollMethodSummary | null
  onChange?: () => void
  disabled?: boolean
}) {
  return (
    <View style={styles.methodSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Receive payroll to</Text>
        {onChange ? (
          <Pressable
            onPress={onChange}
            disabled={disabled}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Change receiving method"
          >
            <Text style={[styles.changeText, disabled && styles.disabledText]}>Change</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.currentMethod}>
        <View style={styles.methodIcon}>
          <MethodIcon type={method?.type ?? 'easetag'} />
        </View>
        <View style={styles.grow}>
          <Text style={styles.methodTitle}>{payrollMethodTitle(method)}</Text>
          <Text style={styles.muted}>{payrollMethodDescription(method)}</Text>
        </View>
        {method ? (
          <View style={styles.currentBadge}>
            <Check size={13} color={colors.success.main} />
            <Text style={styles.currentText}>Current</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

export function PayrollMethodPickerSheet({
  visible,
  methods,
  selectedMethodId,
  selectingMethodId,
  onSelect,
  onAddOrReplace,
  onDelete,
  onClose,
}: {
  visible: boolean
  methods: PayrollMethodSummary[]
  selectedMethodId: string
  selectingMethodId?: string
  onSelect: (method: PayrollMethodSummary) => void
  onAddOrReplace: (method?: PayrollMethodSummary) => void
  onDelete: (method: PayrollMethodSummary) => void
  onClose: () => void
}) {
  const [managing, setManaging] = useState<PayrollMethodSummary | null>(null)
  const external = methods.find((method) => method.type !== 'easetag')

  function close() {
    setManaging(null)
    onClose()
  }

  return (
    <WebAwareModal visible={visible} onRequestClose={close} compact nativePanelStyle={styles.pickerPanel}>
      <View style={styles.pickerHeader}>
        <View style={styles.grow}>
          <Text style={styles.pickerTitle}>{managing ? 'Manage receiving method' : 'Choose receiving method'}</Text>
          <Text style={styles.muted}>
            {managing ? payrollMethodDescription(managing) : 'Choose where this business should send your payroll.'}
          </Text>
        </View>
        <Pressable onPress={close} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close">
          <X size={21} color={colors.text.secondary} />
        </Pressable>
      </View>

      {managing ? (
        <View style={styles.pickerRows}>
          <Pressable
            style={styles.actionRow}
            onPress={() => {
              const method = managing
              setManaging(null)
              onAddOrReplace(method)
            }}
            accessibilityRole="button"
          >
            <View style={styles.methodIcon}>
              <MethodIcon type={managing.type} />
            </View>
            <View style={styles.grow}>
              <Text style={styles.methodTitle}>Replace details</Text>
              <Text style={styles.muted}>Enter a new {payrollMethodTitle(managing).toLowerCase()}</Text>
            </View>
            <ChevronRight size={18} color={colors.text.tertiary} />
          </Pressable>
          <Pressable
            style={styles.actionRow}
            onPress={() => {
              const method = managing
              setManaging(null)
              onDelete(method)
            }}
            accessibilityRole="button"
          >
            <View style={[styles.methodIcon, styles.deleteIcon]}>
              <Trash2 size={20} color={colors.error.main} />
            </View>
            <View style={styles.grow}>
              <Text style={[styles.methodTitle, styles.deleteText]}>Delete method</Text>
              <Text style={styles.muted}>Easetag will remain available</Text>
            </View>
          </Pressable>
        </View>
      ) : (
        <View style={styles.pickerRows}>
          {methods.map((method) => {
            const selected = method.id === selectedMethodId
            const selecting = method.id === selectingMethodId
            return (
              <View key={method.id} style={styles.pickerMethodRow}>
                <Pressable
                  style={styles.pickerMethodSelect}
                  onPress={() => onSelect(method)}
                  disabled={Boolean(selectingMethodId) || selected}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, busy: selecting }}
                >
                  <View style={styles.methodIcon}>
                    <MethodIcon type={method.type} />
                  </View>
                  <View style={styles.grow}>
                    <View style={styles.inline}>
                      <Text style={styles.methodTitle}>{payrollMethodTitle(method)}</Text>
                      {method.type === 'easetag' ? <Text style={styles.recommended}>Recommended</Text> : null}
                    </View>
                    <Text style={styles.muted}>{payrollMethodDescription(method)}</Text>
                  </View>
                  {selecting ? (
                    <ActivityIndicator size="small" color={colors.primary.main} />
                  ) : selected ? (
                    <View style={styles.selectedCircle}>
                      <Check size={14} color={colors.neutral.white} />
                    </View>
                  ) : (
                    <View style={styles.radio} />
                  )}
                </Pressable>
                {method.type !== 'easetag' ? (
                  <Pressable
                    onPress={() => setManaging(method)}
                    style={styles.moreButton}
                    accessibilityRole="button"
                    accessibilityLabel="Manage receiving method"
                  >
                    <MoreHorizontal size={21} color={colors.text.secondary} />
                  </Pressable>
                ) : null}
              </View>
            )
          })}
          <Pressable style={styles.addRow} onPress={() => onAddOrReplace(external)} accessibilityRole="button">
            <View style={styles.addIcon}>
              <Plus size={20} color={colors.primary.main} />
            </View>
            <View style={styles.grow}>
              <Text style={styles.methodTitle}>{external ? 'Replace saved method' : 'Add a receiving method'}</Text>
              <Text style={styles.muted}>Bank account, mobile money or wallet address</Text>
            </View>
            <ChevronRight size={18} color={colors.text.tertiary} />
          </Pressable>
        </View>
      )}
    </WebAwareModal>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  muted: { ...textStyles.bodySmall, color: colors.text.secondary },
  identityCard: {
    padding: spacing[4],
    gap: spacing[4],
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.default,
    backgroundColor: colors.background.primary,
  },
  identityTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  identityMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  businessLogo: { width: 48, height: 48, borderRadius: borderRadius.lg },
  businessIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary.main + '12',
  },
  businessName: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  methodSection: { gap: spacing[3] },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  changeText: {
    ...textStyles.labelMedium,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
  },
  disabledText: { color: colors.text.tertiary },
  currentMethod: {
    minHeight: 76,
    padding: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.primary.main + '55',
    backgroundColor: colors.primary.main + '08',
  },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary.main + '12',
  },
  methodTitle: {
    ...textStyles.titleSmall,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    backgroundColor: colors.success.main + '12',
  },
  currentText: {
    ...textStyles.labelSmall,
    color: colors.success.main,
    fontFamily: fontFamily.semibold,
  },
  pickerPanel: { paddingBottom: spacing[6] },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    padding: spacing[5],
  },
  pickerTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    marginBottom: spacing[1],
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.secondary,
  },
  pickerRows: { paddingHorizontal: spacing[5], gap: spacing[2] },
  pickerMethodRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.default,
    borderRadius: borderRadius.xl,
  },
  pickerMethodSelect: {
    flex: 1,
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingLeft: spacing[3],
    paddingVertical: spacing[2],
  },
  moreButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[1],
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    marginRight: spacing[3],
  },
  selectedCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary.main,
    marginRight: spacing[3],
  },
  recommended: {
    ...textStyles.labelSmall,
    color: colors.primary.main,
    backgroundColor: colors.primary.main + '10',
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  addRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.default,
  },
  addIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary.main + '12',
  },
  actionRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.default,
  },
  deleteIcon: { backgroundColor: colors.error.main + '10' },
  deleteText: { color: colors.error.main },
})
