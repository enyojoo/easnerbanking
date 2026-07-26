import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Building2, Check, ShieldCheck } from 'lucide-react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import ScreenWrapper from '../../components/ScreenWrapper'
import InternalHeader from '../../components/InternalHeader'
import EmptyState from '../../components/EmptyState'
import { Button, SectionCard } from '../../components/ui'
import {
  PayrollBusinessIdentityCard,
  PayrollCurrentMethodCard,
  PayrollMethodPickerSheet,
} from '../../components/payroll/PayrollConnectionUI'
import { EasnerAlertSheet } from '../../components/premium'
import { useToast } from '../../components/ToastProvider'
import { NavigationProps } from '../../types'
import { apiFetch } from '../../query/api-client'
import { useScope } from '../../query/scope'
import { payrollConnectionsKey, usePayrollConnections } from '../../features/payroll/queries'
import type {
  PayrollConnectionsResponse,
  PayrollInvitationDetail,
  PayrollMethodSummary,
} from '../../features/payroll/types'
import { payrollMethodTitle } from '../../features/payroll/types'
import { clearPayrollApprovalToken, readPayrollApprovalToken } from '../../lib/payrollApprovalTokenStore'
import { markPayrollActivityVisible } from '../../lib/payrollActivityVisibility'
import { haptics } from '../../lib/haptics'
import { borderRadius, colors, fontFamily, spacing, textStyles } from '../../theme'
import { useFixedFooterPadding, useScrollPaddingAboveFooter } from '../../hooks/useScrollBottomPadding'

export default function PayrollInvitationScreen({ navigation, route }: NavigationProps) {
  const invitationId = typeof route.params?.invitationId === 'string' ? route.params.invitationId : ''
  const { scope } = useScope()
  const queryClient = useQueryClient()
  const connectionsQuery = usePayrollConnections()
  const { showError, showSuccess } = useToast()
  const footerPadding = useFixedFooterPadding(spacing[4])
  const scrollPadding = useScrollPaddingAboveFooter(112, spacing[6])
  const [resolved, setResolved] = useState<PayrollInvitationDetail | null>(null)
  const [resolving, setResolving] = useState(!invitationId)
  const [error, setError] = useState('')
  const [selectedMethodId, setSelectedMethodId] = useState('')
  const [pickerVisible, setPickerVisible] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PayrollMethodSummary | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [responding, setResponding] = useState<'approve' | 'decline' | ''>('')
  const [completed, setCompleted] = useState('')
  const resolvedTokenRef = useRef(false)

  const cachedInvitation = useMemo(
    () => connectionsQuery.data?.pendingInvitations?.find((item) => item.id === invitationId) ?? null,
    [connectionsQuery.data?.pendingInvitations, invitationId],
  )
  const invitation = cachedInvitation ?? resolved

  useEffect(() => {
    const requested = typeof route.params?.selectedMethodId === 'string' ? route.params.selectedMethodId : ''
    if (!requested) return
    setSelectedMethodId(requested)
    navigation.setParams?.({ selectedMethodId: undefined })
  }, [navigation, route.params?.selectedMethodId])

  useEffect(() => {
    if (!invitation) return
    if (scope?.userId) void markPayrollActivityVisible(scope.userId)
    setSelectedMethodId((current) => {
      if (current && invitation.methods.some((method) => method.id === current)) {
        return current
      }
      return (
        invitation.methods.find((method) => method.preferred)?.id ??
        invitation.methods.find((method) => method.type === 'easetag')?.id ??
        ''
      )
    })
  }, [invitation, scope?.userId])

  const resolveStoredInvitation = useCallback(async () => {
    if (invitationId || resolvedTokenRef.current) return
    resolvedTokenRef.current = true
    setResolving(true)
    setError('')
    try {
      const token = await readPayrollApprovalToken()
      if (!token) throw new Error('This payroll request is no longer available.')
      const response = await apiFetch<{ invitation: PayrollInvitationDetail }>('/api/payroll/invitations/resolve', {
        method: 'POST',
        body: { token },
      })
      setResolved(response.invitation)
      if (scope) {
        queryClient.setQueryData<PayrollConnectionsResponse>(payrollConnectionsKey(scope.userId), (current) => ({
          connections: current?.connections ?? [],
          pendingInvitations: [
            response.invitation,
            ...(current?.pendingInvitations ?? []).filter((item) => item.id !== response.invitation.id),
          ],
        }))
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open payroll request')
    } finally {
      setResolving(false)
    }
  }, [invitationId, queryClient, scope])

  useEffect(() => {
    void resolveStoredInvitation()
  }, [resolveStoredInvitation])

  useFocusEffect(
    useCallback(() => {
      if (invitationId) void connectionsQuery.refetch()
    }, [connectionsQuery.refetch, invitationId]),
  )

  function openMethodFlow(method?: PayrollMethodSummary) {
    if (!invitation) return
    setPickerVisible(false)
    navigation.navigate('PayrollReceivingMethod', {
      context: 'invitation',
      ownerId: invitation.id,
      mode: method ? 'replace' : 'add',
      existingMethod: method,
    })
  }

  async function deleteMethod() {
    if (!invitation || !deleteTarget) return
    const target = deleteTarget
    setDeleting(true)
    setDeleteTarget(null)
    try {
      await apiFetch(`/api/payroll/invitations/${invitation.id}/methods/${target.id}`, { method: 'DELETE' })
      const nextMethods = invitation.methods.filter((method) => method.id !== target.id)
      const next = { ...invitation, methods: nextMethods }
      setResolved(next)
      if (scope) {
        queryClient.setQueryData<PayrollConnectionsResponse>(payrollConnectionsKey(scope.userId), (current) =>
          current
            ? {
                ...current,
                pendingInvitations: (current.pendingInvitations ?? []).map((item) =>
                  item.id === invitation.id ? next : item,
                ),
              }
            : current,
        )
      }
      const easetag = nextMethods.find((method) => method.type === 'easetag')
      if (selectedMethodId === target.id) {
        setSelectedMethodId(easetag?.id ?? '')
      }
      haptics.success()
      showSuccess('Receiving method deleted')
    } catch (caught) {
      haptics.error()
      showError(caught instanceof Error ? caught.message : 'Could not delete receiving method')
    } finally {
      setDeleting(false)
    }
  }

  async function respond(action: 'approve' | 'decline') {
    if (!invitation || responding) return
    setResponding(action)
    setError('')
    try {
      const result = await apiFetch<{ readinessStatus?: string }>(
        `/api/payroll/invitations/${invitation.id}/${action}`,
        {
          method: 'POST',
          body: action === 'approve' ? { preferredMethodId: selectedMethodId } : {},
        },
      )
      await clearPayrollApprovalToken()
      await queryClient.invalidateQueries({
        queryKey: scope ? payrollConnectionsKey(scope.userId) : ['personal', 'payroll', 'connections'],
      })
      const message =
        action === 'approve'
          ? result.readinessStatus === 'ready'
            ? `You've shared your payroll information with ${invitation.businessName}.`
            : `You've approved ${invitation.businessName}. Your receiving method still needs attention.`
          : `You've declined ${invitation.businessName}'s payroll request.`
      setCompleted(message)
      haptics.success()
    } catch (caught) {
      haptics.error()
      setError(caught instanceof Error ? caught.message : `Could not ${action} payroll request`)
    } finally {
      setResponding('')
    }
  }

  function finish() {
    if (navigation.popTo) {
      navigation.popTo('PayrollConnections', { message: completed })
    } else {
      navigation.navigate('PayrollConnections', { message: completed })
    }
  }

  if (completed) {
    return (
      <ScreenWrapper>
        <InternalHeader title="Payroll Connections" onBack={finish} />
        <View style={styles.completionWrap}>
          <SectionCard style={styles.completionCard}>
            <View style={styles.completionIcon}>
              <Check size={28} color={colors.success.main} />
            </View>
            <Text style={styles.completionTitle}>Request updated</Text>
            <Text style={styles.completionText}>{completed}</Text>
            <Button title="Done" onPress={finish} fullWidth />
          </SectionCard>
        </View>
      </ScreenWrapper>
    )
  }

  if (resolving || (!invitation && connectionsQuery.isPending)) {
    return (
      <ScreenWrapper>
        <InternalHeader title="Payroll request" onBack={() => navigation.goBack()} />
        <View style={styles.completionWrap}>
          <SectionCard>
            <Text style={styles.loadingText}>Opening payroll request…</Text>
          </SectionCard>
        </View>
      </ScreenWrapper>
    )
  }

  if (!invitation) {
    return (
      <ScreenWrapper>
        <InternalHeader title="Payroll request" onBack={() => navigation.goBack()} />
        <View style={styles.completionWrap}>
          <SectionCard>
            <EmptyState
              icon={Building2}
              title="Payroll request unavailable"
              message={error || 'This request may have expired or already been completed.'}
              action={{
                label: 'Back to Payroll Connections',
                onPress: () => navigation.goBack(),
              }}
            />
          </SectionCard>
        </View>
      </ScreenWrapper>
    )
  }

  const selectedMethod = invitation.methods.find((method) => method.id === selectedMethodId) ?? null

  return (
    <ScreenWrapper>
      <InternalHeader title="Payroll request" subtitle={invitation.businessName} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: scrollPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <PayrollBusinessIdentityCard
          connection={{
            id: invitation.connectionId,
            businessName: invitation.businessName,
            businessEasetag: invitation.businessEasetag,
            businessLogoUrl: invitation.businessLogoUrl,
            businessVerified: invitation.businessVerified,
            status: invitation.status,
            approvedAt: null,
            revokedAt: null,
            preferredMethod: selectedMethod,
          }}
        />

        <SectionCard style={styles.card}>
          <View style={styles.sectionHeading}>
            <ShieldCheck size={19} color={colors.primary.main} />
            <Text style={styles.sectionTitle}>Information you’ll share</Text>
          </View>
          {invitation.sharedFields.map((field) => (
            <View key={field} style={styles.sharedRow}>
              <Check size={16} color={colors.success.main} />
              <Text style={styles.sharedText}>{field}</Text>
            </View>
          ))}
          <Text style={styles.privacy}>Identity documents and full receiving credentials are never shared.</Text>
        </SectionCard>

        <PayrollCurrentMethodCard method={selectedMethod} onChange={() => setPickerVisible(true)} />

        {error ? (
          <Pressable style={styles.error} onPress={() => setError('')} accessibilityRole="alert">
            <Text style={styles.errorText}>{error}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: footerPadding }]}>
        <Text style={styles.footerSummary}>
          {selectedMethod
            ? `Receive payroll via ${payrollMethodTitle(selectedMethod)}`
            : 'Choose a receiving method to approve'}
        </Text>
        <Button
          title="Approve"
          onPress={() => void respond('approve')}
          loading={responding === 'approve'}
          disabled={!selectedMethodId || Boolean(responding)}
          fullWidth
        />
        <Button
          title="Decline"
          variant="ghost"
          onPress={() => void respond('decline')}
          loading={responding === 'decline'}
          disabled={Boolean(responding)}
          fullWidth
        />
      </View>

      <PayrollMethodPickerSheet
        visible={pickerVisible}
        methods={invitation.methods}
        selectedMethodId={selectedMethodId}
        onSelect={(method) => {
          setSelectedMethodId(method.id)
          setPickerVisible(false)
          haptics.select()
        }}
        onAddOrReplace={openMethodFlow}
        onDelete={(method) => {
          setPickerVisible(false)
          setDeleteTarget(method)
        }}
        onClose={() => setPickerVisible(false)}
      />
      <EasnerAlertSheet
        visible={Boolean(deleteTarget)}
        onDismiss={() => {
          if (!deleting) setDeleteTarget(null)
        }}
        title="Delete receiving method?"
        message="Easetag will remain available for this payroll request."
        primaryLabel="Delete method"
        onPrimary={() => void deleteMethod()}
        secondaryLabel="Keep method"
        onSecondary={() => setDeleteTarget(null)}
        primaryDestructive
        primaryLoading={deleting}
      />
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
  card: { padding: spacing[4], gap: spacing[3] },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  sectionTitle: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  sharedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  sharedText: { ...textStyles.bodyMedium, color: colors.text.primary },
  privacy: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing[2],
  },
  error: {
    padding: spacing[4],
    borderRadius: borderRadius.xl,
    backgroundColor: colors.error.main + '0D',
  },
  errorText: { ...textStyles.bodySmall, color: colors.text.primary },
  footer: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    gap: spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.light,
    backgroundColor: colors.background.primary,
  },
  footerSummary: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  completionWrap: {
    flex: 1,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    justifyContent: 'center',
    padding: spacing[5],
  },
  completionCard: {
    alignItems: 'center',
    padding: spacing[6],
    gap: spacing[3],
  },
  completionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success.main + '12',
  },
  completionTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  completionText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  loadingText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    textAlign: 'center',
    paddingVertical: spacing[7],
  },
})
