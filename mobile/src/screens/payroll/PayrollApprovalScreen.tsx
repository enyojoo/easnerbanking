import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  Building2,
  Check,
  ChevronRight,
  FileText,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import ScreenWrapper from '../../components/ScreenWrapper'
import { Button, SectionCard, StatusPill } from '../../components/ui'
import InternalHeader from '../../components/InternalHeader'
import EmptyState from '../../components/EmptyState'
import { ListRowSkeleton } from '../../components/skeletons'
import { NavigationProps } from '../../types'
import { apiFetch } from '../../query/api-client'
import { colors, borderRadius, fontFamily, spacing, textStyles } from '../../theme'
import { useScope } from '../../query/scope'
import { useFocusRefresh } from '../../hooks/useFocusRefresh'
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'
import {
  clearPayrollApprovalToken,
  readPayrollApprovalToken,
  storePayrollApprovalToken,
} from '../../lib/payrollApprovalTokenStore'
import { PayStubSheet } from '../../components/payroll/PayStubSheet'
import { CachedImage } from '../../components/CachedImage'
import { markPayrollActivityVisible } from '../../lib/payrollActivityVisibility'
import {
  PayrollReceivingMethodSheet,
  type PayrollExternalMethodType,
  type PayrollReceivingMethodResult,
} from '../../components/payroll/PayrollReceivingMethodSheet'
import { EasnerAlertSheet } from '../../components/premium'

type Method = {
  id: string
  type: 'easetag' | 'bank' | 'mobile_money' | 'stablecoin'
  label: string
  maskedDetails: Record<string, string>
  preferred: boolean
}

type Invitation = {
  id: string
  connectionId: string
  businessName: string
  businessEasetag: string | null
  businessLogoUrl?: string | null
  businessVerified?: boolean
  personName: string
  status: string
  expiresAt: string
  sharedFields: string[]
  methods: Method[]
}

type Connection = {
  id: string
  businessName: string
  businessEasetag?: string | null
  businessLogoUrl?: string | null
  businessVerified?: boolean
  status: string
  approvedAt: string | null
  revokedAt: string | null
  preferredMethod: Method | null
}

type ConnectionDetail = Connection & {
  readinessStatus: string | null
  sharedIdentity: Record<string, string | null>
  methods: Method[]
  paymentHistory: Array<{
    lineId: string
    amount: number
    currency: string
    status: string
    paidAt: string | null
    document: { id?: string; filename?: string; metadata?: Record<string, unknown> } | null
  }>
}

type ConnectionsResponse = {
  connections: Connection[]
  pendingInvitations?: Invitation[]
}

const PAYROLL_CONNECTIONS_STALE_MS = 5 * 60_000

function methodDescription(method: Method | null): string {
  if (!method) return 'Receiving method needed'
  const masked = Object.values(method.maskedDetails ?? {}).filter(Boolean).join(' · ')
  return masked || method.label
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

export default function PayrollApprovalScreen({ navigation, route }: NavigationProps) {
  const { scope } = useScope()
  const queryClient = useQueryClient()
  const scrollBottomPadding = useScrollBottomPadding(spacing[6])
  const routeToken = typeof route.params?.token === 'string' ? route.params.token : null
  const routeConnectionId = typeof route.params?.connectionId === 'string' ? route.params.connectionId : null
  const routeInvitationId = typeof route.params?.invitationId === 'string' ? route.params.invitationId : null
  const [bootstrapping, setBootstrapping] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(routeConnectionId)
  const [selectedMethodId, setSelectedMethodId] = useState('')
  const [completedMessage, setCompletedMessage] = useState('')
  const [selectedDocumentId, setSelectedDocumentId] = useState('')
  const [methodSheet, setMethodSheet] = useState<{
    invitationId?: string
    connectionId?: string
    editingMethod?: {
      id: string
      type: PayrollExternalMethodType
      label: string
    } | null
  } | null>(null)
  const [methodDeleteTarget, setMethodDeleteTarget] = useState<{
    id: string
    label: string
    invitation: boolean
  } | null>(null)

  const connectionsKey = useMemo(
    () => scope
      ? ['personal', scope.userId, 'payroll', 'connections'] as const
      : ['personal', 'payroll', 'connections', 'disabled'] as const,
    [scope],
  )
  const connectionsQuery = useQuery({
    queryKey: connectionsKey,
    enabled: Boolean(scope),
    queryFn: () => apiFetch<ConnectionsResponse>('/api/payroll/connections'),
    staleTime: PAYROLL_CONNECTIONS_STALE_MS,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: true,
    meta: { safePersist: true, freshness: 'operational' },
  })
  const detailQuery = useQuery({
    queryKey: scope && selectedConnectionId
      ? ['personal', scope.userId, 'payroll', 'connections', selectedConnectionId] as const
      : ['personal', 'payroll', 'connection', 'disabled'] as const,
    enabled: Boolean(scope && selectedConnectionId),
    queryFn: () =>
      apiFetch<{ connection: ConnectionDetail }>(
        `/api/payroll/connections/${selectedConnectionId}`,
      ).then((response) => response.connection),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
    // Payment history is intentionally kept in memory only.
    meta: { safePersist: false, freshness: 'operational' },
  })
  const connections = connectionsQuery.data?.connections ?? []
  const pendingInvitations = connectionsQuery.data?.pendingInvitations ?? []
  const detail = detailQuery.data ?? null

  useEffect(() => {
    if (
      scope?.userId
      && (invitation || connections.length > 0 || pendingInvitations.length > 0)
    ) {
      void markPayrollActivityVisible(scope.userId)
    }
  }, [connections.length, invitation, pendingInvitations.length, scope?.userId])

  const refreshConnections = useCallback(async () => {
    await connectionsQuery.refetch()
  }, [connectionsQuery.refetch])

  useFocusRefresh(refreshConnections, PAYROLL_CONNECTIONS_STALE_MS)

  const resolveInvitation = useCallback(async (token: string) => {
    setError('')
    try {
      const response = await apiFetch<{ invitation: Invitation }>('/api/payroll/invitations/resolve', {
        method: 'POST',
        body: { token },
      })
      setInvitation(response.invitation)
      const preferred = response.invitation.methods.find((method) => method.preferred)
        ?? response.invitation.methods.find((method) => method.type === 'easetag')
      setSelectedMethodId(preferred?.id ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open payroll invitation')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (routeToken) {
        await storePayrollApprovalToken(routeToken)
        navigation.setParams?.({ token: undefined })
        if (typeof window !== 'undefined') window.history.replaceState({}, '', '/payroll')
      }
      const storedToken = routeToken || await readPayrollApprovalToken()
      if (cancelled) return
      if (storedToken) {
        await resolveInvitation(storedToken)
      } else if (routeInvitationId) {
        try {
          const response = await connectionsQuery.refetch()
          const requested = response.data?.pendingInvitations?.find((item) => item.id === routeInvitationId)
          if (requested && !cancelled) {
            setInvitation(requested)
            const preferred = requested.methods.find((method) => method.preferred)
              ?? requested.methods.find((method) => method.type === 'easetag')
            setSelectedMethodId(preferred?.id ?? '')
          }
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : 'Could not load payroll connections')
          }
        }
      }
      if (!cancelled) setBootstrapping(false)
    })()
    return () => { cancelled = true }
  }, [connectionsQuery.refetch, navigation, resolveInvitation, route.params?.methodUpdatedAt, routeInvitationId, routeToken])

  useEffect(() => {
    if (routeConnectionId) setSelectedConnectionId(routeConnectionId)
  }, [routeConnectionId])

  const goBackFromBusiness = useCallback(async () => {
    setError('')
    setMethodSheet(null)
    setMethodDeleteTarget(null)
    setSelectedDocumentId('')
    setSelectedConnectionId(null)
    setInvitation(null)
    setSelectedMethodId('')
    setCompletedMessage('')
    await clearPayrollApprovalToken()
    navigation.setParams?.({
      token: undefined,
      connectionId: undefined,
      invitationId: undefined,
    })
  }, [navigation])

  useEffect(() => {
    if (!route.params?.methodUpdatedAt || !selectedConnectionId) return
    void detailQuery.refetch()
    void connectionsQuery.refetch()
  }, [connectionsQuery.refetch, detailQuery.refetch, route.params?.methodUpdatedAt, selectedConnectionId])

  function openReceivingMethodSetup(
    context: { invitationId?: string; connectionId?: string },
    editingMethod?: Method,
  ) {
    const externalMethod = editingMethod && editingMethod.type !== 'easetag'
      ? {
          id: editingMethod.id,
          type: editingMethod.type as PayrollExternalMethodType,
          label: editingMethod.label,
        }
      : null
    setMethodSheet({ ...context, editingMethod: externalMethod })
  }

  async function handleReceivingMethodSaved(method: PayrollReceivingMethodResult) {
    if (methodSheet?.invitationId) {
      setInvitation((current) => current
        ? {
            ...current,
            methods: [
              ...current.methods.filter((item) => item.type === 'easetag'),
              method,
            ],
          }
        : current)
      setSelectedMethodId(method.id)
      return
    }
    await Promise.all([
      detailQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: connectionsKey }),
    ])
  }

  async function selectConnectionMethod(methodId: string) {
    if (!detail) return
    setBusy(true)
    setError('')
    try {
      await apiFetch(`/api/payroll/connections/${detail.id}/methods/${methodId}`, { method: 'PATCH' })
      await Promise.all([
        detailQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: connectionsKey }),
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change receiving method')
    } finally {
      setBusy(false)
    }
  }

  async function deleteConnectionMethod(methodId: string): Promise<boolean> {
    if (!detail) return false
    setBusy(true)
    setError('')
    try {
      await apiFetch(`/api/payroll/connections/${detail.id}/methods/${methodId}`, { method: 'DELETE' })
      await Promise.all([
        detailQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: connectionsKey }),
      ])
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete receiving method')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function deleteInvitationMethod(methodId: string): Promise<boolean> {
    if (!invitation) return false
    setBusy(true)
    setError('')
    try {
      await apiFetch(
        `/api/payroll/invitations/${invitation.id}/methods/${methodId}`,
        { method: 'DELETE' },
      )
      setInvitation((current) => current
        ? { ...current, methods: current.methods.filter((method) => method.id !== methodId) }
        : current)
      if (selectedMethodId === methodId) {
        const easetag = invitation.methods.find((method) => method.type === 'easetag')
        setSelectedMethodId(easetag?.id ?? '')
      }
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete receiving method')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function confirmDeleteReceivingMethod() {
    if (!methodDeleteTarget) return
    const deleted = methodDeleteTarget.invitation
      ? await deleteInvitationMethod(methodDeleteTarget.id)
      : await deleteConnectionMethod(methodDeleteTarget.id)
    if (deleted) setMethodDeleteTarget(null)
  }

  async function respond(action: 'approve' | 'decline') {
    if (!invitation) return
    setBusy(true)
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
      setInvitation(null)
      setCompletedMessage(
        action === 'approve'
          ? result.readinessStatus === 'ready'
            ? `You've shared your payroll information with ${invitation.businessName}.`
            : `You've approved ${invitation.businessName}. Your receiving method still needs verification before payroll can be sent.`
          : `You've declined ${invitation.businessName}'s payroll request.`,
      )
      await queryClient.invalidateQueries({ queryKey: connectionsKey })
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not ${action} invitation`)
    } finally {
      setBusy(false)
    }
  }

  async function revokeConnection() {
    if (!detail) return
    const revokedConnectionId = detail.id
    const revokedBusinessName = detail.businessName
    const revokedAt = new Date().toISOString()
    setBusy(true)
    setError('')
    try {
      await apiFetch(`/api/payroll/connections/${detail.id}`, { method: 'DELETE' })
      queryClient.setQueryData<ConnectionsResponse>(connectionsKey, (current) => {
        if (!current) return current
        return {
          ...current,
          connections: current.connections.map((connection) =>
            connection.id === revokedConnectionId
              ? {
                  ...connection,
                  status: 'revoked',
                  revokedAt,
                }
              : connection,
          ),
        }
      })
      setCompletedMessage(`Payroll connection with ${revokedBusinessName} has been revoked.`)
      setSelectedConnectionId(null)
      queryClient.removeQueries({
        queryKey: ['personal', scope?.userId, 'payroll', 'connections', revokedConnectionId],
        exact: true,
      })
      void queryClient.invalidateQueries({ queryKey: connectionsKey })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revoke approval')
    } finally {
      setBusy(false)
    }
  }

  const showDetail = Boolean(selectedConnectionId)
  const initialListLoading = !connectionsQuery.data && connectionsQuery.isPending
  const initialDetailLoading = showDetail && !detail && detailQuery.isPending
  const loading = bootstrapping || (!invitation && (initialListLoading || initialDetailLoading))

  if (loading) {
    return (
      <ScreenWrapper>
        <InternalHeader
          title={showDetail ? 'Payroll details' : 'Payroll Connections'}
          onBack={showDetail ? goBackFromBusiness : undefined}
        />
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]}
          showsVerticalScrollIndicator={false}
        >
          <PayrollScreenSkeleton detail={showDetail} />
        </ScrollView>
      </ScreenWrapper>
    )
  }

  if (invitation) {
    return (
      <ScreenWrapper>
        <InternalHeader title="Payroll Connections" onBack={goBackFromBusiness} />
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]}
          showsVerticalScrollIndicator={false}
        >
          <SectionCard style={styles.businessHero}>
            {invitation.businessLogoUrl ? (
              <CachedImage uri={invitation.businessLogoUrl} style={styles.businessLogo} contentFit="cover" />
            ) : (
              <View style={styles.businessIcon}><Building2 size={26} color={colors.primary.main} /></View>
            )}
            <Text style={styles.businessName}>{invitation.businessName}</Text>
            {invitation.businessEasetag ? <Text style={styles.muted}>@{invitation.businessEasetag.replace(/^@/, '')}</Text> : null}
            <View style={styles.verifiedRow}>
              <ShieldCheck size={15} color={invitation.businessVerified ? colors.success.main : colors.text.secondary} />
              <Text style={styles.muted}>{invitation.businessVerified ? 'Verified business' : 'Business verification pending'}</Text>
            </View>
            <Text style={styles.body}>wants to connect with you for payroll payments.</Text>
          </SectionCard>

          <SectionCard style={styles.card}>
            <View style={styles.sectionHeading}>
              <ShieldCheck size={19} color={colors.primary.main} />
              <Text style={styles.sectionTitle}>Information you’ll share</Text>
            </View>
            {invitation.sharedFields.map((field) => (
              <View key={field} style={styles.checkRow}>
                <Check size={16} color={colors.success.main} />
                <Text style={styles.rowText}>{field}</Text>
              </View>
            ))}
            <Text style={styles.privacyNote}>Identity documents and full payout credentials are never shared.</Text>
          </SectionCard>

          <Text style={styles.label}>Receive payroll via</Text>
          {invitation.methods.map((method) => (
            <View
              key={method.id}
              style={[styles.method, selectedMethodId === method.id && styles.methodSelected]}
            >
              <Pressable
                onPress={() => setSelectedMethodId(method.id)}
                style={styles.methodSelect}
                accessibilityRole="radio"
                accessibilityState={{ checked: selectedMethodId === method.id }}
              >
                <View style={[styles.radio, selectedMethodId === method.id && styles.radioSelected]}>
                  {selectedMethodId === method.id ? <View style={styles.radioDot} /> : null}
                </View>
                <View style={styles.grow}>
                  <Text style={styles.methodTitle}>{method.type === 'easetag' ? 'Easetag' : method.label}</Text>
                  <Text style={styles.muted}>{methodDescription(method)}</Text>
                </View>
              </Pressable>
              {method.type !== 'easetag' ? (
                <MethodActions
                  disabled={busy}
                  onEdit={() => openReceivingMethodSetup({ invitationId: invitation.id }, method)}
                  onDelete={() => setMethodDeleteTarget({
                    id: method.id,
                    label: method.label,
                    invitation: true,
                  })}
                />
              ) : null}
            </View>
          ))}

          <AddReceivingMethodButton
            onPress={() => openReceivingMethodSetup({ invitationId: invitation.id })}
          />

          {error ? (
            <InlineError
              message={error}
              actionLabel="Dismiss"
              onRetry={() => setError('')}
            />
          ) : null}
          <View style={styles.actions}>
            <Button title="Approve" onPress={() => void respond('approve')} loading={busy}
              disabled={!selectedMethodId} fullWidth />
            <Button title="Decline" onPress={() => void respond('decline')} variant="ghost"
              disabled={busy} fullWidth />
          </View>
        </ScrollView>
        <PayrollReceivingMethodSheet
          visible={Boolean(methodSheet)}
          invitationId={methodSheet?.invitationId}
          connectionId={methodSheet?.connectionId}
          editingMethod={methodSheet?.editingMethod}
          onClose={() => setMethodSheet(null)}
          onSaved={handleReceivingMethodSaved}
        />
        <EasnerAlertSheet
          visible={Boolean(methodDeleteTarget)}
          onDismiss={() => {
            if (!busy) setMethodDeleteTarget(null)
          }}
          title="Delete receiving method?"
          message={`Delete ${methodDeleteTarget?.label ?? 'this receiving method'} from Payroll?`}
          primaryLabel="Delete"
          onPrimary={() => void confirmDeleteReceivingMethod()}
          secondaryLabel="Cancel"
          onSecondary={() => setMethodDeleteTarget(null)}
          primaryDestructive
          primaryLoading={busy}
        />
      </ScreenWrapper>
    )
  }

  if (detail) {
    return (
      <ScreenWrapper>
        <InternalHeader title={detail.businessName} onBack={goBackFromBusiness} />
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={detailQuery.isRefetching}
              onRefresh={() => void detailQuery.refetch()}
              tintColor={colors.primary.main}
            />
          }
        >
          {detailQuery.error ? (
            <InlineError
              message={detailQuery.error instanceof Error ? detailQuery.error.message : 'Could not refresh payroll details'}
              onRetry={() => void detailQuery.refetch()}
            />
          ) : null}
          <SectionCard style={styles.card}>
            <Text style={styles.sectionTitle}>Payroll connection</Text>
            <View style={styles.detailRow}><Text style={styles.muted}>Status</Text><StatusPill label={detail.status} tone={detail.status === 'approved' ? 'completed' : 'neutral'} /></View>
            <View style={styles.detailRow}><Text style={styles.muted}>Payroll readiness</Text><Text style={styles.rowText}>{detail.readinessStatus === 'ready' ? 'Ready' : 'Needs attention'}</Text></View>
            <View style={styles.detailRow}><Text style={styles.muted}>Receiving via</Text><Text style={styles.rowText}>{methodDescription(detail.preferredMethod)}</Text></View>
          </SectionCard>
          {detail.status === 'approved' ? (
            <>
              <Text style={styles.label}>Receiving method</Text>
              {detail.methods.map((method) => (
                <View key={method.id} style={[styles.method, method.preferred && styles.methodSelected]}>
                  <Pressable
                    style={styles.methodSelect}
                    disabled={busy || method.preferred}
                    onPress={() => void selectConnectionMethod(method.id)}
                  >
                    <View style={[styles.radio, method.preferred && styles.radioSelected]}>
                      {method.preferred ? <View style={styles.radioDot} /> : null}
                    </View>
                    <View style={styles.grow}>
                      <Text style={styles.methodTitle}>{method.type === 'easetag' ? 'Easetag' : method.label}</Text>
                      <Text style={styles.muted}>{methodDescription(method)}</Text>
                    </View>
                  </Pressable>
                  {method.type !== 'easetag' ? (
                    <MethodActions
                      disabled={busy}
                      onEdit={() => openReceivingMethodSetup({ connectionId: detail.id }, method)}
                      onDelete={() => setMethodDeleteTarget({
                        id: method.id,
                        label: method.label,
                        invitation: false,
                      })}
                    />
                  ) : null}
                </View>
              ))}
              <AddReceivingMethodButton
                onPress={() => openReceivingMethodSetup({ connectionId: detail.id })}
              />
            </>
          ) : null}
          <Text style={styles.label}>Payment history</Text>
          {detail.paymentHistory.length === 0 ? (
            <SectionCard>
              <Text style={styles.emptyCardText}>Payments and pay stubs from this business will appear here.</Text>
            </SectionCard>
          ) : detail.paymentHistory.map((payment) => (
              <SectionCard key={payment.lineId} style={styles.card}>
                <View style={styles.detailRow}>
                  <View>
                    <Text style={styles.methodTitle}>{money(payment.amount, payment.currency)}</Text>
                    <Text style={styles.muted}>{payment.paidAt ? new Date(payment.paidAt).toLocaleDateString() : payment.status}</Text>
                  </View>
                  {payment.document?.id ? (
                    <Pressable onPress={() => setSelectedDocumentId(String(payment.document?.id))} style={styles.documentButton}>
                      <FileText size={16} color={colors.primary.main} />
                      <Text style={styles.documentButtonText}>Pay stub</Text>
                    </Pressable>
                  ) : null}
                </View>
              </SectionCard>
            ))}
          {error ? <InlineError message={error} actionLabel="Dismiss" onRetry={() => setError('')} /> : null}
          {detail.status === 'approved' ? (
            <Button title="Revoke approval" variant="destructive" onPress={() => void revokeConnection()} loading={busy} fullWidth />
          ) : null}
        </ScrollView>
        <PayStubSheet
          visible={Boolean(selectedDocumentId)}
          documentId={selectedDocumentId}
          onClose={() => setSelectedDocumentId('')}
        />
        <PayrollReceivingMethodSheet
          visible={Boolean(methodSheet)}
          invitationId={methodSheet?.invitationId}
          connectionId={methodSheet?.connectionId}
          editingMethod={methodSheet?.editingMethod}
          onClose={() => setMethodSheet(null)}
          onSaved={handleReceivingMethodSaved}
        />
        <EasnerAlertSheet
          visible={Boolean(methodDeleteTarget)}
          onDismiss={() => {
            if (!busy) setMethodDeleteTarget(null)
          }}
          title="Delete receiving method?"
          message={`Delete ${methodDeleteTarget?.label ?? 'this receiving method'} from Payroll?`}
          primaryLabel="Delete"
          onPrimary={() => void confirmDeleteReceivingMethod()}
          secondaryLabel="Cancel"
          onSecondary={() => setMethodDeleteTarget(null)}
          primaryDestructive
          primaryLoading={busy}
        />
      </ScreenWrapper>
    )
  }

  if (showDetail && detailQuery.error) {
    return (
      <ScreenWrapper>
        <InternalHeader title="Payroll details" onBack={goBackFromBusiness} />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]}>
          <SectionCard>
            <EmptyState
              icon={Building2}
              title="Could not load payroll details"
              message={detailQuery.error instanceof Error
                ? detailQuery.error.message
                : 'Check your connection and try again.'}
              action={{ label: 'Try again', onPress: () => void detailQuery.refetch() }}
            />
          </SectionCard>
        </ScrollView>
      </ScreenWrapper>
    )
  }

  if (!connectionsQuery.data && connectionsQuery.error) {
    return (
      <ScreenWrapper>
        <InternalHeader title="Payroll Connections" />
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]}
          refreshControl={
            <RefreshControl
              refreshing={connectionsQuery.isRefetching}
              onRefresh={() => void connectionsQuery.refetch()}
              tintColor={colors.primary.main}
            />
          }
        >
          <SectionCard>
            <EmptyState
              icon={Building2}
              title="Payroll connections unavailable"
              message={connectionsQuery.error instanceof Error
                ? connectionsQuery.error.message
                : 'Check your connection and try again.'}
              action={{ label: 'Try again', onPress: () => void connectionsQuery.refetch() }}
            />
          </SectionCard>
        </ScrollView>
      </ScreenWrapper>
    )
  }

  const approvedConnections = connections.filter((item) => item.status === 'approved')
  const inactiveConnections = connections.filter((item) => item.status !== 'approved')
  const isEmpty = pendingInvitations.length === 0
    && approvedConnections.length === 0
    && inactiveConnections.length === 0

  return (
    <ScreenWrapper>
      <InternalHeader
        title="Payroll Connections"
        subtitle={pendingInvitations.length > 0
          ? `${pendingInvitations.length} request${pendingInvitations.length === 1 ? '' : 's'} waiting`
          : 'Manage who can pay you'}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={connectionsQuery.isRefetching}
            onRefresh={() => void connectionsQuery.refetch()}
            tintColor={colors.primary.main}
          />
        }
      >
        {completedMessage ? <View style={styles.successBox}><Check size={18} color={colors.success.main} /><Text style={styles.successText}>{completedMessage}</Text></View> : null}
        {connectionsQuery.error ? (
          <InlineError
            message="Some payroll information may be out of date."
            onRetry={() => void connectionsQuery.refetch()}
          />
        ) : null}
        {isEmpty ? (
          <SectionCard>
            <EmptyState
              icon={Building2}
              title="No payroll connections"
              message="Payroll requests from businesses will appear here for you to review."
            />
          </SectionCard>
        ) : (
          <>
            {pendingInvitations.length > 0 ? (
              <ConnectionSection title="Pending" count={pendingInvitations.length}>
                {pendingInvitations.map((pending, index) => (
                  <ConnectionRow
                    key={pending.id}
                    title={pending.businessName}
                    subtitle="Review payroll request"
                    logoUrl={pending.businessLogoUrl}
                    showDivider={index < pendingInvitations.length - 1}
                    onPress={() => {
                      setInvitation(pending)
                      const preferred = pending.methods.find((method) => method.preferred)
                        ?? pending.methods.find((method) => method.type === 'easetag')
                      setSelectedMethodId(preferred?.id ?? '')
                    }}
                  />
                ))}
              </ConnectionSection>
            ) : null}
            {approvedConnections.length > 0 ? (
              <ConnectionSection title="Approved" count={approvedConnections.length}>
                {approvedConnections.map((connection, index) => (
                  <ConnectionRow
                    key={connection.id}
                    title={connection.businessName}
                    subtitle={methodDescription(connection.preferredMethod)}
                    logoUrl={connection.businessLogoUrl}
                    showDivider={index < approvedConnections.length - 1}
                    onPress={() => {
                      setError('')
                      setSelectedConnectionId(connection.id)
                    }}
                  />
                ))}
              </ConnectionSection>
            ) : null}
            {inactiveConnections.length > 0 ? (
              <ConnectionSection title="Inactive" count={inactiveConnections.length}>
                {inactiveConnections.map((connection, index) => (
                  <ConnectionRow
                    key={connection.id}
                    title={connection.businessName}
                    subtitle={connection.status.charAt(0).toUpperCase() + connection.status.slice(1)}
                    logoUrl={connection.businessLogoUrl}
                    showDivider={index < inactiveConnections.length - 1}
                    onPress={() => {
                      setError('')
                      setSelectedConnectionId(connection.id)
                    }}
                  />
                ))}
              </ConnectionSection>
            ) : null}
          </>
        )}
        {error ? <InlineError message={error} actionLabel="Dismiss" onRetry={() => setError('')} /> : null}
      </ScrollView>
    </ScreenWrapper>
  )
}

function AddReceivingMethodButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.addMethod, pressed && styles.connectionRowPressed]}
      accessibilityRole="button"
      accessibilityLabel="Add a receiving method. Either a bank account, mobile money or wallet address."
    >
      <View style={styles.addMethodIcon}>
        <Plus size={20} color={colors.primary.main} />
      </View>
      <View style={styles.grow}>
        <Text style={styles.methodTitle}>Add a receiving method</Text>
        <Text style={styles.muted}>Either a bank account, mobile money or wallet address</Text>
      </View>
      <ChevronRight size={18} color={colors.text.tertiary} />
    </Pressable>
  )
}

function MethodActions({
  disabled,
  onEdit,
  onDelete,
}: {
  disabled: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <View style={styles.methodActions}>
      <Pressable
        disabled={disabled}
        onPress={onEdit}
        style={styles.methodAction}
        accessibilityRole="button"
        accessibilityLabel="Edit receiving method"
      >
        <Pencil size={17} color={colors.text.primary} />
      </Pressable>
      <Pressable
        disabled={disabled}
        onPress={onDelete}
        style={styles.methodAction}
        accessibilityRole="button"
        accessibilityLabel="Delete receiving method"
      >
        <Trash2 size={17} color={colors.error.main} />
      </Pressable>
    </View>
  )
}

function PayrollScreenSkeleton({ detail }: { detail: boolean }) {
  return (
    <>
      {detail ? (
        <SectionCard style={styles.skeletonSummary}>
          <ListRowSkeleton variant="plain" showDivider />
          <ListRowSkeleton variant="plain" showDivider />
          <ListRowSkeleton variant="plain" showDivider={false} />
        </SectionCard>
      ) : (
        <>
          <View style={styles.skeletonSectionLabel} />
          <SectionCard flush>
            <ListRowSkeleton variant="recipient" showDivider />
            <ListRowSkeleton variant="recipient" showDivider={false} />
          </SectionCard>
          <View style={styles.skeletonSectionLabel} />
          <SectionCard flush>
            <ListRowSkeleton variant="recipient" showDivider />
            <ListRowSkeleton variant="recipient" showDivider={false} />
          </SectionCard>
        </>
      )}
    </>
  )
}

function InlineError({
  message,
  onRetry,
  actionLabel = 'Retry',
}: {
  message: string
  onRetry: () => void
  actionLabel?: string
}) {
  return (
    <View style={styles.errorBanner} accessibilityRole="alert">
      <Text style={styles.errorBannerText}>{message}</Text>
      <Pressable onPress={onRetry} accessibilityRole="button">
        <Text style={styles.retryText}>{actionLabel}</Text>
      </Pressable>
    </View>
  )
}

function ConnectionSection({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <View style={styles.connectionSection}>
      <View style={styles.connectionSectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      </View>
      <SectionCard flush>{children}</SectionCard>
    </View>
  )
}

function ConnectionRow({
  title,
  subtitle,
  logoUrl,
  showDivider,
  onPress,
}: {
  title: string
  subtitle: string
  logoUrl?: string | null
  showDivider: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.connectionRow,
        showDivider && styles.connectionRowDivider,
        pressed && styles.connectionRowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
    >
      {logoUrl ? (
        <CachedImage uri={logoUrl} style={styles.connectionLogo} contentFit="cover" />
      ) : (
        <View style={styles.businessIcon}>
          <Building2 size={20} color={colors.primary.main} />
        </View>
      )}
      <View style={styles.grow}>
        <Text style={styles.methodTitle}>{title}</Text>
        <Text style={styles.muted}>{subtitle}</Text>
      </View>
      <ChevronRight size={18} color={colors.text.tertiary} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing[5], paddingTop: spacing[2], gap: spacing[5], width: '100%', maxWidth: 680, alignSelf: 'center' },
  businessHero: { alignItems: 'center', gap: spacing[2], paddingVertical: spacing[6] },
  businessIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary.main + '12', alignItems: 'center', justifyContent: 'center' },
  connectionLogo: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.background.secondary },
  businessLogo: { width: 56, height: 56, borderRadius: borderRadius.lg, backgroundColor: colors.background.secondary },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  businessName: { ...textStyles.headingMedium, fontFamily: fontFamily.semibold, color: colors.text.primary, textAlign: 'center' },
  body: { ...textStyles.bodyMedium, color: colors.text.secondary, textAlign: 'center' },
  muted: { ...textStyles.bodySmall, color: colors.text.secondary },
  card: { padding: spacing[4], gap: spacing[3] },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  sectionTitle: { ...textStyles.titleMedium, color: colors.text.primary, fontFamily: fontFamily.semibold },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  rowText: { ...textStyles.bodyMedium, color: colors.text.primary },
  privacyNote: { ...textStyles.bodySmall, color: colors.text.secondary, marginTop: spacing[2] },
  label: { ...textStyles.titleSmall, fontFamily: fontFamily.semibold, color: colors.text.primary, marginTop: spacing[2] },
  method: { minHeight: 68, padding: spacing[4], borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border.default, flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  methodSelect: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  methodSelected: { borderColor: colors.primary.main, backgroundColor: colors.primary.main + '08' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border.default, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: colors.primary.main },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary.main },
  grow: { flex: 1, gap: 2 },
  methodTitle: { ...textStyles.titleSmall, color: colors.text.primary, fontFamily: fontFamily.semibold },
  actions: { gap: spacing[2], marginTop: spacing[2] },
  emptyCardText: { ...textStyles.bodyMedium, color: colors.text.secondary, textAlign: 'center', paddingVertical: spacing[5] },
  successBox: { flexDirection: 'row', gap: spacing[2], padding: spacing[4], borderRadius: borderRadius.lg, backgroundColor: colors.success.main + '12' },
  successText: { ...textStyles.bodyMedium, color: colors.text.primary, flex: 1 },
  connectionSection: { gap: spacing[3] },
  connectionSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing[1] },
  countBadge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: spacing[2], alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary.main + '12' },
  countText: { ...textStyles.labelSmall, color: colors.primary.main, fontFamily: fontFamily.semibold },
  connectionRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  connectionRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.light },
  connectionRowPressed: { opacity: 0.72 },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] },
  documentButton: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], padding: spacing[2] },
  documentButtonText: { ...textStyles.titleSmall, color: colors.primary.main },
  methodActions: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  methodAction: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.background.secondary },
  addMethod: { minHeight: 76, padding: spacing[4], borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border.default, flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  addMethodIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary.main + '12' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], borderRadius: borderRadius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.error.main + '45', backgroundColor: colors.error.main + '0D' },
  errorBannerText: { ...textStyles.bodySmall, color: colors.text.primary, flex: 1 },
  retryText: { ...textStyles.labelMedium, color: colors.primary.main, fontFamily: fontFamily.semibold },
  skeletonSummary: { padding: 0, overflow: 'hidden' },
  skeletonSectionLabel: { width: 88, height: 18, marginLeft: spacing[1], borderRadius: borderRadius.sm, backgroundColor: colors.neutral[200] },
})
