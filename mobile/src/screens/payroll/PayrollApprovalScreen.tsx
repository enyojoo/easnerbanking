import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { ArrowLeft, Building2, Check, ChevronRight, FileText, ShieldCheck } from 'lucide-react-native'
import ScreenWrapper from '../../components/ScreenWrapper'
import { Button, SectionCard, StatusPill } from '../../components/ui'
import { NavigationProps } from '../../types'
import { apiFetch } from '../../query/api-client'
import { colors, borderRadius, fontFamily, spacing, textStyles } from '../../theme'
import {
  clearPayrollApprovalToken,
  readPayrollApprovalToken,
  storePayrollApprovalToken,
} from '../../lib/payrollApprovalTokenStore'
import { PayStubSheet } from '../../components/payroll/PayStubSheet'
import { CachedImage } from '../../components/CachedImage'

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
  const routeToken = typeof route.params?.token === 'string' ? route.params.token : null
  const routeConnectionId = typeof route.params?.connectionId === 'string' ? route.params.connectionId : null
  const routeInvitationId = typeof route.params?.invitationId === 'string' ? route.params.invitationId : null
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [connections, setConnections] = useState<Connection[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([])
  const [detail, setDetail] = useState<ConnectionDetail | null>(null)
  const [selectedMethodId, setSelectedMethodId] = useState('')
  const [completedMessage, setCompletedMessage] = useState('')
  const [selectedDocumentId, setSelectedDocumentId] = useState('')

  const loadConnections = useCallback(async () => {
    const response = await apiFetch<{ connections: Connection[]; pendingInvitations?: Invitation[] }>('/api/payroll/connections')
    setConnections(response.connections ?? [])
    setPendingInvitations(response.pendingInvitations ?? [])
    return response
  }, [])

  const loadDetail = useCallback(async (id: string) => {
    setLoading(true)
    setError('')
    try {
      const response = await apiFetch<{ connection: ConnectionDetail }>(`/api/payroll/connections/${id}`)
      setDetail(response.connection)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load payroll connection')
    } finally {
      setLoading(false)
    }
  }, [])

  const resolveInvitation = useCallback(async (token: string) => {
    setLoading(true)
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
    } finally {
      setLoading(false)
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
      } else if (routeConnectionId) {
        await loadDetail(routeConnectionId)
      } else {
        try {
          const response = await loadConnections()
          const requested = response.pendingInvitations?.find((item) => item.id === routeInvitationId)
          if (requested) {
            setInvitation(requested)
            const preferred = requested.methods.find((method) => method.preferred)
              ?? requested.methods.find((method) => method.type === 'easetag')
            setSelectedMethodId(preferred?.id ?? '')
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not load payroll approvals')
        } finally {
          if (!cancelled) setLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [loadConnections, loadDetail, navigation, resolveInvitation, route.params?.methodUpdatedAt, routeConnectionId, routeInvitationId, routeToken])

  function openReceivingMethodSetup(context: { invitationId?: string; connectionId?: string }) {
    navigation.navigate('Recipients', {
      payrollMode: true,
      payrollInvitationId: context.invitationId,
      payrollConnectionId: context.connectionId,
    })
  }

  async function selectConnectionMethod(methodId: string) {
    if (!detail) return
    setBusy(true)
    setError('')
    try {
      await apiFetch(`/api/payroll/connections/${detail.id}/methods/${methodId}`, { method: 'PATCH' })
      await loadDetail(detail.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change receiving method')
    } finally {
      setBusy(false)
    }
  }

  async function deleteConnectionMethod(methodId: string) {
    if (!detail) return
    setBusy(true)
    setError('')
    try {
      await apiFetch(`/api/payroll/connections/${detail.id}/methods/${methodId}`, { method: 'DELETE' })
      await loadDetail(detail.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete receiving method')
    } finally {
      setBusy(false)
    }
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
      await loadConnections()
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not ${action} invitation`)
    } finally {
      setBusy(false)
    }
  }

  async function revokeConnection() {
    if (!detail) return
    setBusy(true)
    try {
      await apiFetch(`/api/payroll/connections/${detail.id}`, { method: 'DELETE' })
      setCompletedMessage(`Payroll approval for ${detail.businessName} was revoked.`)
      setDetail(null)
      await loadConnections()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revoke approval')
    } finally {
      setBusy(false)
    }
  }

  function Header({ title }: { title: string }) {
    return (
      <View style={styles.header}>
        <Pressable onPress={() => detail ? setDetail(null) : navigation.goBack()} accessibilityLabel="Back">
          <ArrowLeft size={22} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>
    )
  }

  if (loading) {
    return (
      <ScreenWrapper>
        <Header title="Payroll Approval" />
        <View style={styles.center}><ActivityIndicator color={colors.primary.main} /></View>
      </ScreenWrapper>
    )
  }

  if (invitation) {
    return (
      <ScreenWrapper>
        <Header title="Payroll Approval" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.businessHero}>
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
          </View>

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
            <Pressable
              key={method.id}
              onPress={() => setSelectedMethodId(method.id)}
              style={[styles.method, selectedMethodId === method.id && styles.methodSelected]}
            >
              <View style={[styles.radio, selectedMethodId === method.id && styles.radioSelected]}>
                {selectedMethodId === method.id ? <View style={styles.radioDot} /> : null}
              </View>
              <View style={styles.grow}>
                <Text style={styles.methodTitle}>{method.type === 'easetag' ? 'EASETAG' : method.label}</Text>
                <Text style={styles.muted}>{methodDescription(method)}</Text>
              </View>
            </Pressable>
          ))}

          <Button title="Add bank, mobile money, or stablecoin" variant="outline"
            onPress={() => openReceivingMethodSetup({ invitationId: invitation.id })} fullWidth />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Button title="Approve" onPress={() => void respond('approve')} loading={busy}
              disabled={!selectedMethodId} fullWidth />
            <Button title="Decline" onPress={() => void respond('decline')} variant="ghost"
              disabled={busy} fullWidth />
          </View>
        </ScrollView>
      </ScreenWrapper>
    )
  }

  if (detail) {
    return (
      <ScreenWrapper>
        <Header title={detail.businessName} />
        <ScrollView contentContainerStyle={styles.content}>
          <SectionCard style={styles.card}>
            <Text style={styles.sectionTitle}>Payroll connection</Text>
            <View style={styles.detailRow}><Text style={styles.muted}>Status</Text><StatusPill label={detail.status} tone={detail.status === 'approved' ? 'success' : 'neutral'} /></View>
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
                      <Text style={styles.methodTitle}>{method.type === 'easetag' ? 'EASETAG' : method.label}</Text>
                      <Text style={styles.muted}>{methodDescription(method)}</Text>
                    </View>
                  </Pressable>
                  {method.type !== 'easetag' ? (
                    <Pressable disabled={busy} onPress={() => void deleteConnectionMethod(method.id)}>
                      <Text style={styles.deleteText}>Delete</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
              <Button title="Add or replace receiving method" variant="outline"
                onPress={() => openReceivingMethodSetup({ connectionId: detail.id })} fullWidth />
            </>
          ) : null}
          <Text style={styles.label}>Payment history</Text>
          {detail.paymentHistory.length === 0 ? <Text style={styles.muted}>No payroll payments yet.</Text> : detail.paymentHistory.map((payment) => (
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
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {detail.status === 'approved' ? (
            <Button title="Revoke approval" variant="destructive" onPress={() => void revokeConnection()} loading={busy} fullWidth />
          ) : null}
        </ScrollView>
        <PayStubSheet
          visible={Boolean(selectedDocumentId)}
          documentId={selectedDocumentId}
          onClose={() => setSelectedDocumentId('')}
        />
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper>
      <Header title="Payroll Approval" />
      <ScrollView contentContainerStyle={styles.content}>
        {completedMessage ? <View style={styles.successBox}><Check size={18} color={colors.success.main} /><Text style={styles.successText}>{completedMessage}</Text></View> : null}
        <Text style={styles.label}>Pending</Text>
        {pendingInvitations.length === 0 ? (
          <Text style={styles.muted}>No pending payroll requests.</Text>
        ) : pendingInvitations.map((pending) => (
          <Pressable key={pending.id} style={styles.connectionRow} onPress={() => {
            setInvitation(pending)
            const preferred = pending.methods.find((method) => method.preferred)
              ?? pending.methods.find((method) => method.type === 'easetag')
            setSelectedMethodId(preferred?.id ?? '')
          }}>
            <View style={styles.businessIcon}><Building2 size={20} color={colors.primary.main} /></View>
            <View style={styles.grow}>
              <Text style={styles.methodTitle}>{pending.businessName}</Text>
              <Text style={styles.muted}>Review payroll connection request</Text>
            </View>
            <ChevronRight size={18} color={colors.text.tertiary} />
          </Pressable>
        ))}
        <Text style={styles.label}>Approved</Text>
        {connections.filter((item) => item.status === 'approved').length === 0 ? (
          <Text style={styles.muted}>No approved payroll connections.</Text>
        ) : connections.filter((item) => item.status === 'approved').map((connection) => (
          <Pressable key={connection.id} style={styles.connectionRow} onPress={() => void loadDetail(connection.id)}>
            <View style={styles.businessIcon}><Building2 size={20} color={colors.primary.main} /></View>
            <View style={styles.grow}>
              <Text style={styles.methodTitle}>{connection.businessName}</Text>
              <Text style={styles.muted}>{methodDescription(connection.preferredMethod)}</Text>
            </View>
            <ChevronRight size={18} color={colors.text.tertiary} />
          </Pressable>
        ))}
        <Text style={styles.label}>Inactive</Text>
        {connections.filter((item) => item.status !== 'approved').length === 0 ? (
          <Text style={styles.muted}>No inactive connections.</Text>
        ) : connections.filter((item) => item.status !== 'approved').map((connection) => (
          <Pressable key={connection.id} style={styles.connectionRow} onPress={() => void loadDetail(connection.id)}>
            <View style={styles.grow}>
              <Text style={styles.methodTitle}>{connection.businessName}</Text>
              <Text style={styles.muted}>{connection.status}</Text>
            </View>
            <ChevronRight size={18} color={colors.text.tertiary} />
          </Pressable>
        ))}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  header: { minHeight: 56, paddingHorizontal: spacing[4], flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.default },
  headerTitle: { ...textStyles.titleMedium, fontFamily: fontFamily.semibold, color: colors.text.primary, flex: 1, textAlign: 'center' },
  headerSpacer: { width: 22 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing[4], paddingBottom: spacing[10], gap: spacing[4], width: '100%', maxWidth: 680, alignSelf: 'center' },
  businessHero: { alignItems: 'center', gap: spacing[2], paddingVertical: spacing[4] },
  businessIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary.main + '12', alignItems: 'center', justifyContent: 'center' },
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
  error: { ...textStyles.bodySmall, color: colors.error.main },
  successBox: { flexDirection: 'row', gap: spacing[2], padding: spacing[4], borderRadius: borderRadius.lg, backgroundColor: colors.success.main + '12' },
  successText: { ...textStyles.bodyMedium, color: colors.text.primary, flex: 1 },
  connectionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], borderWidth: 1, borderColor: colors.border.default, borderRadius: borderRadius.lg, backgroundColor: colors.background.primary },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] },
  documentButton: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], padding: spacing[2] },
  documentButtonText: { ...textStyles.titleSmall, color: colors.primary.main },
  deleteText: { ...textStyles.bodySmall, color: colors.error.main, fontFamily: fontFamily.semibold },
})
