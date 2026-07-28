import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Building2, Check, ChevronRight } from 'lucide-react-native'
import { useQueryClient } from '@tanstack/react-query'
import ScreenWrapper from '../../components/ScreenWrapper'
import InternalHeader from '../../components/InternalHeader'
import EmptyState from '../../components/EmptyState'
import { CachedImage } from '../../components/CachedImage'
import { SectionCard } from '../../components/ui'
import { ListRowSkeleton } from '../../components/skeletons'
import { NavigationProps } from '../../types'
import { useScope } from '../../query/scope'
import { useFocusRefresh } from '../../hooks/useFocusRefresh'
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding'
import {
  PAYROLL_CONNECTIONS_STALE_MS,
  payrollConnectionsKey,
  prefetchPayrollConnectionDetail,
  usePayrollConnections,
} from '../../features/payroll/queries'
import { payrollMethodDescription, type PayrollConnectionSummary } from '../../features/payroll/types'
import { markPayrollActivityVisible } from '../../lib/payrollActivityVisibility'
import { exitToMainTabs } from '../../navigation/stackBackNavigation'
import { borderRadius, colors, fontFamily, spacing, textStyles } from '../../theme'

export default function PayrollConnectionsScreen({ navigation, route }: NavigationProps) {
  const { scope } = useScope()
  const queryClient = useQueryClient()
  const query = usePayrollConnections()
  const bottomPadding = useScrollBottomPadding(spacing[6])
  const [message, setMessage] = useState(typeof route.params?.message === 'string' ? route.params.message : '')
  const [refreshing, setRefreshing] = useState(false)
  const exitingRef = useRef(false)
  const connections = query.data?.connections ?? []
  const pending = query.data?.pendingInvitations ?? []
  const approved = useMemo(() => connections.filter((item) => item.status === 'approved'), [connections])
  const inactive = useMemo(() => connections.filter((item) => item.status !== 'approved'), [connections])

  useEffect(() => {
    const next = typeof route.params?.message === 'string' ? route.params.message : ''
    if (!next) return
    setMessage(next)
    navigation.setParams?.({ message: undefined })
  }, [navigation, route.params?.message])

  useEffect(() => {
    if (scope?.userId && (connections.length || pending.length)) {
      void markPayrollActivityVisible(scope.userId)
    }
  }, [connections.length, pending.length, scope?.userId])

  const refresh = useCallback(async () => {
    if (!scope?.userId) return
    // Skip if More (or another screen) already warmed this cache recently.
    const updatedAt =
      queryClient.getQueryState(payrollConnectionsKey(scope.userId))?.dataUpdatedAt ?? 0
    if (Date.now() - updatedAt < PAYROLL_CONNECTIONS_STALE_MS) return
    await query.refetch()
  }, [query.refetch, queryClient, scope?.userId])
  useFocusRefresh(refresh, PAYROLL_CONNECTIONS_STALE_MS)

  const onRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await query.refetch()
    } finally {
      setRefreshing(false)
    }
  }, [query.refetch, refreshing])

  const exitToMore = useCallback(() => {
    if (exitingRef.current) return
    exitingRef.current = true
    exitToMainTabs(navigation, 'More')
  }, [navigation])

  useEffect(() => {
    const unsubscribe = navigation.addListener?.('beforeRemove', (event: { preventDefault: () => void }) => {
      if (exitingRef.current) return
      event.preventDefault()
      exitToMore()
    })
    return unsubscribe
  }, [exitToMore, navigation])

  function openConnection(connection: PayrollConnectionSummary) {
    navigation.navigate('PayrollConnectionDetail', {
      connectionId: connection.id,
    })
  }

  function prefetchConnection(connectionId: string) {
    void prefetchPayrollConnectionDetail(queryClient, scope?.userId, connectionId)
  }

  // Match Recipients/Transactions: skeleton only on cold miss; cached data paints immediately.
  const initialLoading = query.isPending && !query.data
  const empty = !pending.length && !approved.length && !inactive.length

  return (
    <ScreenWrapper>
      <InternalHeader
        title="Payroll Connections"
        subtitle={
          pending.length
            ? `${pending.length} request${pending.length === 1 ? '' : 's'} waiting`
            : 'Companies, receiving methods and pay stubs'
        }
        onBack={exitToMore}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.primary.main}
          />
        }
      >
        {message ? (
          <Pressable style={styles.success} onPress={() => setMessage('')} accessibilityRole="alert">
            <Check size={18} color={colors.success.main} />
            <Text style={styles.successText}>{message}</Text>
          </Pressable>
        ) : null}

        {query.error && query.data ? (
          <View style={styles.error}>
            <Text style={styles.errorText}>Some Payroll information may be out of date.</Text>
            <Pressable onPress={() => void query.refetch()}>
              <Text style={styles.retry}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {initialLoading ? (
          <ConnectionsSkeleton />
        ) : query.error && !query.data ? (
          <SectionCard>
            <EmptyState
              icon={Building2}
              title="Payroll connections unavailable"
              message="Check your connection and try again."
              action={{
                label: 'Try again',
                onPress: () => void query.refetch(),
              }}
            />
          </SectionCard>
        ) : empty ? (
          <SectionCard>
            <EmptyState
              icon={Building2}
              title="No payroll connections"
              message="Payroll requests from businesses will appear here for you to review."
            />
          </SectionCard>
        ) : (
          <>
            {pending.length ? (
              <ConnectionSection title="Pending" count={pending.length}>
                {pending.map((invitation, index) => (
                  <ConnectionRow
                    key={invitation.id}
                    title={invitation.businessName}
                    subtitle="Review payroll request"
                    logoUrl={invitation.businessLogoUrl}
                    divider={index < pending.length - 1}
                    onPress={() =>
                      navigation.navigate('PayrollInvitation', {
                        invitationId: invitation.id,
                      })
                    }
                  />
                ))}
              </ConnectionSection>
            ) : null}
            {approved.length ? (
              <ConnectionSection title="Approved" count={approved.length}>
                {approved.map((connection, index) => (
                  <ConnectionRow
                    key={connection.id}
                    title={connection.businessName}
                    subtitle={payrollMethodDescription(connection.preferredMethod)}
                    logoUrl={connection.businessLogoUrl}
                    divider={index < approved.length - 1}
                    onPressIn={() => prefetchConnection(connection.id)}
                    onPress={() => openConnection(connection)}
                  />
                ))}
              </ConnectionSection>
            ) : null}
            {inactive.length ? (
              <ConnectionSection title="Inactive" count={inactive.length}>
                {inactive.map((connection, index) => (
                  <ConnectionRow
                    key={connection.id}
                    title={connection.businessName}
                    subtitle={connection.status.charAt(0).toUpperCase() + connection.status.slice(1)}
                    logoUrl={connection.businessLogoUrl}
                    divider={index < inactive.length - 1}
                    onPressIn={() => prefetchConnection(connection.id)}
                    onPress={() => openConnection(connection)}
                  />
                ))}
              </ConnectionSection>
            ) : null}
          </>
        )}
      </ScrollView>
    </ScreenWrapper>
  )
}

function ConnectionSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.count}>
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
  divider,
  onPress,
  onPressIn,
}: {
  title: string
  subtitle: string
  logoUrl?: string | null
  divider: boolean
  onPress: () => void
  onPressIn?: () => void
}) {
  return (
    <Pressable
      onPressIn={onPressIn}
      onPress={onPress}
      style={({ pressed }) => [styles.row, divider && styles.divider, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
    >
      {logoUrl ? (
        <CachedImage uri={logoUrl} style={styles.logo} contentFit="cover" />
      ) : (
        <View style={styles.logoFallback}>
          <Building2 size={20} color={colors.primary.main} />
        </View>
      )}
      <View style={styles.grow}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <ChevronRight size={18} color={colors.text.tertiary} />
    </Pressable>
  )
}

function ConnectionsSkeleton() {
  return (
    <>
      <View style={styles.skeletonLabel} />
      <SectionCard flush>
        <ListRowSkeleton variant="recipient" showDivider />
        <ListRowSkeleton variant="recipient" showDivider={false} />
      </SectionCard>
      <View style={styles.skeletonLabel} />
      <SectionCard flush>
        <ListRowSkeleton variant="recipient" showDivider={false} />
      </SectionCard>
    </>
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
  success: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[4],
    borderRadius: borderRadius.xl,
    backgroundColor: colors.success.main + '12',
  },
  successText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    flex: 1,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: borderRadius.xl,
    backgroundColor: colors.error.main + '0D',
  },
  errorText: { ...textStyles.bodySmall, color: colors.text.primary, flex: 1 },
  retry: {
    ...textStyles.labelMedium,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
  },
  section: { gap: spacing[3] },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[1],
  },
  sectionTitle: {
    ...textStyles.titleMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  count: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: spacing[2],
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary.main + '12',
  },
  countText: {
    ...textStyles.labelSmall,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
  },
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
  },
  pressed: { opacity: 0.72 },
  logo: { width: 44, height: 44, borderRadius: 22 },
  logoFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary.main + '12',
  },
  rowTitle: {
    ...textStyles.titleSmall,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  rowSubtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
  skeletonLabel: {
    width: 88,
    height: 18,
    marginLeft: spacing[1],
    borderRadius: borderRadius.sm,
    backgroundColor: colors.neutral[200],
  },
})
