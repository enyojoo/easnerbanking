import React, { useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { FileText } from 'lucide-react-native'
import { useQueryClient } from '@tanstack/react-query'
import ScreenWrapper from '../../components/ScreenWrapper'
import InternalHeader from '../../components/InternalHeader'
import EmptyState from '../../components/EmptyState'
import { Button, SectionCard, StatusPill } from '../../components/ui'
import { ListRowSkeleton } from '../../components/skeletons'
import { PayStubSheet } from '../../components/payroll/PayStubSheet'
import { PayrollBusinessIdentityCard, PayrollInlineMethodsCard } from '../../components/payroll/PayrollConnectionUI'
import {
  PayrollReceivingMethodSheet,
  type PayrollExternalMethodType,
  type PayrollReceivingMethodResult,
} from '../../components/payroll/PayrollReceivingMethodSheet'
import { EasnerAlertSheet } from '../../components/premium'
import { useToast } from '../../components/ToastProvider'
import { NavigationProps } from '../../types'
import { apiFetch } from '../../query/api-client'
import { useScope } from '../../query/scope'
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'
import {
  payrollConnectionDetailKey,
  payrollConnectionsKey,
  usePayrollConnectionDetail,
} from '../../features/payroll/queries'
import type {
  PayrollConnectionDetail,
  PayrollConnectionsResponse,
  PayrollMethodSummary,
} from '../../features/payroll/types'
import { haptics } from '../../lib/haptics'
import { borderRadius, colors, fontFamily, spacing, textStyles } from '../../theme'

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

export default function PayrollConnectionDetailScreen({ navigation, route }: NavigationProps) {
  const connectionId = String(route.params?.connectionId ?? '')
  const { scope } = useScope()
  const queryClient = useQueryClient()
  const query = usePayrollConnectionDetail(connectionId || null)
  const { showSuccess, showError } = useToast()
  const bottomPadding = useScrollBottomPadding(spacing[6])
  const [selectingMethodId, setSelectingMethodId] = useState('')
  const [methodFlowVisible, setMethodFlowVisible] = useState(false)
  const [editingMethod, setEditingMethod] = useState<PayrollMethodSummary | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PayrollMethodSummary | null>(null)
  const [revokeConfirm, setRevokeConfirm] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [documentId, setDocumentId] = useState('')
  const detail = query.data

  function backToConnections() {
    if (navigation.popTo) navigation.popTo('PayrollConnections')
    else navigation.navigate('PayrollConnections')
  }

  function updateCaches(next: PayrollConnectionDetail) {
    if (!scope) return
    queryClient.setQueryData(payrollConnectionDetailKey(scope.userId, connectionId), next)
    queryClient.setQueryData<PayrollConnectionsResponse>(payrollConnectionsKey(scope.userId), (current) =>
      current
        ? {
            ...current,
            connections: current.connections.map((connection) =>
              connection.id === connectionId
                ? {
                    ...connection,
                    preferredMethod: next.preferredMethod,
                    status: next.status,
                    revokedAt: next.revokedAt,
                  }
                : connection,
            ),
          }
        : current,
    )
  }

  async function selectMethod(method: PayrollMethodSummary) {
    if (!detail || !scope || method.id === detail.preferredMethod?.id) {
      return
    }
    const previousDetail = detail
    const next = {
      ...detail,
      preferredMethod: { ...method, preferred: true },
      methods: detail.methods.map((item) => ({
        ...item,
        preferred: item.id === method.id,
      })),
      readinessStatus: 'ready',
    }
    setSelectingMethodId(method.id)
    updateCaches(next)
    haptics.select()
    try {
      await apiFetch(`/api/payroll/connections/${connectionId}/methods/${method.id}`, { method: 'PATCH' })
      haptics.success()
      showSuccess('Receiving method updated')
      void queryClient.invalidateQueries({
        queryKey: payrollConnectionDetailKey(scope.userId, connectionId),
        exact: true,
      })
      void queryClient.invalidateQueries({
        queryKey: payrollConnectionsKey(scope.userId),
      })
    } catch (error) {
      updateCaches(previousDetail)
      haptics.error()
      showError(error instanceof Error ? error.message : 'Could not change receiving method')
    } finally {
      setSelectingMethodId('')
    }
  }

  function openMethodFlow(method?: PayrollMethodSummary) {
    if (!detail) return
    setEditingMethod(method ?? null)
    setMethodFlowVisible(true)
  }

  async function refresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      await query.refetch()
    } finally {
      setRefreshing(false)
    }
  }

  async function receivingMethodSaved(result: PayrollReceivingMethodResult) {
    if (!detail || !scope) return
    const method: PayrollMethodSummary = { ...result, preferred: true }
    const next: PayrollConnectionDetail = {
      ...detail,
      methods: [
        ...detail.methods.filter((item) => item.type === 'easetag').map((item) => ({ ...item, preferred: false })),
        method,
      ],
      preferredMethod: method,
      readinessStatus: 'ready',
    }
    updateCaches(next)
    setMethodFlowVisible(false)
    haptics.success()
    showSuccess(editingMethod ? 'Receiving method replaced' : 'Receiving method added')
    setEditingMethod(null)
    void queryClient.invalidateQueries({
      queryKey: payrollConnectionDetailKey(scope.userId, connectionId),
      exact: true,
    })
    void queryClient.invalidateQueries({ queryKey: payrollConnectionsKey(scope.userId) })
  }

  async function deleteMethod() {
    if (!detail || !deleteTarget || !scope) return
    const target = deleteTarget
    const previous = detail
    const remaining = detail.methods.filter((method) => method.id !== target.id)
    const easetag = remaining.find((method) => method.type === 'easetag') ?? null
    const fallbackMethod = easetag ? { ...easetag, preferred: true } : null
    const next = {
      ...detail,
      methods: remaining.map((method) => ({
        ...method,
        preferred: method.id === (detail.preferredMethod?.id === target.id ? easetag?.id : detail.preferredMethod?.id),
      })),
      preferredMethod: detail.preferredMethod?.id === target.id ? fallbackMethod : detail.preferredMethod,
    }
    setDeleting(true)
    setDeleteTarget(null)
    updateCaches(next)
    try {
      await apiFetch(`/api/payroll/connections/${connectionId}/methods/${target.id}`, { method: 'DELETE' })
      haptics.success()
      showSuccess('Receiving method deleted')
      void queryClient.invalidateQueries({
        queryKey: payrollConnectionDetailKey(scope.userId, connectionId),
      })
      void queryClient.invalidateQueries({
        queryKey: payrollConnectionsKey(scope.userId),
      })
    } catch (error) {
      updateCaches(previous)
      haptics.error()
      showError(error instanceof Error ? error.message : 'Could not delete receiving method')
    } finally {
      setDeleting(false)
    }
  }

  async function revoke() {
    if (!detail || !scope || revoking) return
    const previous = detail
    const revoked = {
      ...detail,
      status: 'revoked',
      revokedAt: new Date().toISOString(),
    }
    setRevokeConfirm(false)
    setRevoking(true)
    updateCaches(revoked)
    try {
      await apiFetch(`/api/payroll/connections/${connectionId}`, {
        method: 'DELETE',
      })
      queryClient.removeQueries({
        queryKey: payrollConnectionDetailKey(scope.userId, connectionId),
        exact: true,
      })
      haptics.success()
      const params = {
        message: `Payroll connection with ${detail.businessName} has been revoked.`,
      }
      if (navigation.popTo) navigation.popTo('PayrollConnections', params)
      else navigation.navigate('PayrollConnections', params)
    } catch (error) {
      updateCaches(previous)
      haptics.error()
      showError(error instanceof Error ? error.message : 'Could not revoke payroll connection')
    } finally {
      setRevoking(false)
    }
  }

  if (!detail && query.isPending) {
    return (
      <ScreenWrapper>
        <InternalHeader title="Payroll connection" onBack={backToConnections} />
        <View style={styles.content}>
          <SectionCard style={styles.skeletonCard}>
            <ListRowSkeleton variant="recipient" showDivider />
            <ListRowSkeleton variant="plain" showDivider={false} />
          </SectionCard>
          <SectionCard style={styles.skeletonCard}>
            <ListRowSkeleton variant="plain" showDivider={false} />
          </SectionCard>
        </View>
      </ScreenWrapper>
    )
  }

  if (!detail) {
    return (
      <ScreenWrapper>
        <InternalHeader title="Payroll connection" onBack={backToConnections} />
        <View style={styles.content}>
          <SectionCard>
            <EmptyState
              title="Could not load payroll details"
              message="Check your connection and try again."
              action={{
                label: 'Try again',
                onPress: () => void query.refetch(),
              }}
            />
          </SectionCard>
        </View>
      </ScreenWrapper>
    )
  }

  const approved = detail.status === 'approved'

  return (
    <ScreenWrapper>
      <InternalHeader title="Payroll connection" onBack={backToConnections} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors.primary.main}
          />
        }
      >
        {query.error ? (
          <Pressable style={styles.error} onPress={() => void query.refetch()}>
            <Text style={styles.errorText}>Could not refresh these Payroll details. Tap to retry.</Text>
          </Pressable>
        ) : null}

        <PayrollBusinessIdentityCard connection={detail} readinessStatus={detail.readinessStatus} />

        <PayrollInlineMethodsCard
          methods={detail.methods}
          selectedMethodId={detail.preferredMethod?.id ?? ''}
          selectingMethodId={selectingMethodId}
          readOnly={!approved || query.isPlaceholderData || deleting}
          onSelect={(method) => void selectMethod(method)}
          onAdd={() => openMethodFlow()}
          onReplace={(method) => openMethodFlow(method)}
          onDelete={setDeleteTarget}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment history</Text>
          {query.isPlaceholderData ? (
            <SectionCard style={styles.skeletonCard}>
              <ListRowSkeleton variant="plain" showDivider />
              <ListRowSkeleton variant="plain" showDivider={false} />
            </SectionCard>
          ) : detail.paymentHistory.length === 0 ? (
            <SectionCard>
              <Text style={styles.emptyText}>Payments and pay stubs from this business will appear here.</Text>
            </SectionCard>
          ) : (
            <SectionCard flush>
              {detail.paymentHistory.map((payment, index) => (
                <View
                  key={payment.lineId}
                  style={[styles.paymentRow, index < detail.paymentHistory.length - 1 ? styles.divider : null]}
                >
                  <View style={styles.paymentTop}>
                    <View style={styles.grow}>
                      <Text style={styles.paymentAmount}>{money(payment.amount, payment.currency)}</Text>
                      <Text style={styles.muted}>
                        {payment.paidAt ? new Date(payment.paidAt).toLocaleDateString() : 'Payment date pending'}
                      </Text>
                    </View>
                    <StatusPill
                      label={payment.status}
                      tone={payment.status === 'paid' || payment.status === 'completed' ? 'completed' : 'neutral'}
                    />
                  </View>
                  {payment.document?.id ? (
                    <Pressable
                      onPress={() => setDocumentId(String(payment.document?.id))}
                      style={styles.stubButton}
                      accessibilityRole="button"
                      accessibilityLabel="Open pay stub"
                    >
                      <FileText size={16} color={colors.primary.main} />
                      <Text style={styles.stubText}>Pay stub</Text>
                      <Text style={styles.stubChevron}>›</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </SectionCard>
          )}
        </View>

        {approved ? (
          <View style={styles.danger}>
            <Text style={styles.sectionTitle}>Manage connection</Text>
            <Text style={styles.muted}>
              Revoking stops this business from including you in future payroll payments. Existing payments and pay
              stubs remain available.
            </Text>
            <Button
              title="Revoke connection"
              variant="outline"
              style={styles.revokeButton}
              textStyle={styles.revokeButtonText}
              onPress={() => setRevokeConfirm(true)}
              loading={revoking}
              fullWidth
            />
          </View>
        ) : (
          <SectionCard>
            <Text style={styles.inactiveTitle}>This connection is inactive</Text>
            <Text style={styles.muted}>
              Receiving methods cannot be changed, but previous payments and pay stubs remain available.
            </Text>
          </SectionCard>
        )}
      </ScrollView>

      <PayrollReceivingMethodSheet
        visible={methodFlowVisible}
        connectionId={connectionId}
        editingMethod={
          editingMethod && editingMethod.type !== 'easetag'
            ? {
                id: editingMethod.id,
                type: editingMethod.type as PayrollExternalMethodType,
                label: editingMethod.label,
                maskedDetails: editingMethod.maskedDetails,
              }
            : null
        }
        onClose={() => {
          setMethodFlowVisible(false)
          setEditingMethod(null)
        }}
        onSaved={receivingMethodSaved}
      />
      <EasnerAlertSheet
        visible={Boolean(deleteTarget)}
        onDismiss={() => {
          if (!deleting) setDeleteTarget(null)
        }}
        title="Delete receiving method?"
        message="Easetag will remain available and will be selected if this is your current method."
        primaryLabel="Delete method"
        onPrimary={() => void deleteMethod()}
        secondaryLabel="Keep method"
        onSecondary={() => setDeleteTarget(null)}
        primaryDestructive
        primaryLoading={deleting}
      />
      <EasnerAlertSheet
        visible={revokeConfirm}
        onDismiss={() => {
          if (!revoking) setRevokeConfirm(false)
        }}
        title={`Revoke connection with ${detail.businessName}?`}
        message="They will no longer be able to include you in future payroll payments. Existing payments and pay stubs will remain available."
        primaryLabel="Revoke connection"
        onPrimary={() => void revoke()}
        secondaryLabel="Keep connection"
        onSecondary={() => setRevokeConfirm(false)}
        primaryDestructive
        primaryLoading={revoking}
      />
      <PayStubSheet visible={Boolean(documentId)} documentId={documentId} onClose={() => setDocumentId('')} />
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    gap: spacing[5],
  },
  grow: { flex: 1, minWidth: 0 },
  section: { gap: spacing[3] },
  sectionTitle: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  muted: { ...textStyles.bodySmall, color: colors.text.secondary },
  error: {
    padding: spacing[4],
    borderRadius: borderRadius.xl,
    backgroundColor: colors.error.main + '0D',
  },
  errorText: { ...textStyles.bodySmall, color: colors.text.primary },
  skeletonCard: { padding: 0, overflow: 'hidden' },
  emptyText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    textAlign: 'center',
    paddingVertical: spacing[5],
  },
  paymentRow: {
    minHeight: 84,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    gap: spacing[3],
  },
  paymentTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
  },
  paymentAmount: {
    ...textStyles.titleSmall,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  stubButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.light,
    paddingTop: spacing[3],
  },
  stubText: {
    ...textStyles.labelMedium,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
  },
  stubChevron: {
    ...textStyles.titleMedium,
    color: colors.text.tertiary,
    marginLeft: 'auto',
  },
  danger: {
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.error.main + '45',
    backgroundColor: colors.error.main + '05',
  },
  revokeButton: {
    borderColor: colors.error.main + '80',
    backgroundColor: colors.background.primary,
  },
  revokeButtonText: { color: colors.error.main },
  inactiveTitle: {
    ...textStyles.titleSmall,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    marginBottom: spacing[2],
  },
})
