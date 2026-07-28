import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import ScreenWrapper from '../../components/ScreenWrapper'
import {
  PayrollReceivingMethodSheet,
  type PayrollExternalMethodType,
  type PayrollReceivingMethodResult,
} from '../../components/payroll/PayrollReceivingMethodSheet'
import { NavigationProps } from '../../types'
import { useScope } from '../../query/scope'
import { payrollConnectionDetailKey, payrollConnectionsKey } from '../../features/payroll/queries'
import type {
  PayrollConnectionDetail,
  PayrollConnectionsResponse,
  PayrollMethodSummary,
  PayrollReceivingMethodContext,
} from '../../features/payroll/types'
import { haptics } from '../../lib/haptics'
import { colors, spacing, textStyles } from '../../theme'

export default function PayrollReceivingMethodScreen({ navigation, route }: NavigationProps) {
  const { scope } = useScope()
  const queryClient = useQueryClient()
  const context = String(route.params?.context ?? '') as PayrollReceivingMethodContext
  const ownerId = String(route.params?.ownerId ?? '')
  const routeExistingMethod = route.params?.existingMethod as PayrollMethodSummary | undefined
  const cachedExistingMethod = (() => {
    if (!scope || !ownerId) return undefined
    if (context === 'connection') {
      const detail = queryClient.getQueryData<PayrollConnectionDetail>(
        payrollConnectionDetailKey(scope.userId, ownerId),
      )
      return detail?.methods.find((method) => method.type !== 'easetag')
    }
    const list = queryClient.getQueryData<PayrollConnectionsResponse>(
      payrollConnectionsKey(scope.userId),
    )
    return list?.pendingInvitations
      ?.find((invitation) => invitation.id === ownerId)
      ?.methods.find((method) => method.type !== 'easetag')
  })()
  const existingMethod = routeExistingMethod ?? cachedExistingMethod

  async function saved(result: PayrollReceivingMethodResult) {
    if (!scope || !ownerId) {
      navigation.goBack()
      return
    }
    const method: PayrollMethodSummary = {
      ...result,
      preferred: context === 'connection',
    }
    const listKey = payrollConnectionsKey(scope.userId)
    if (context === 'connection') {
      const detailKey = payrollConnectionDetailKey(scope.userId, ownerId)
      queryClient.setQueryData<PayrollConnectionDetail>(detailKey, (current) =>
        current
          ? {
              ...current,
              methods: [
                ...current.methods
                  .filter((item) => item.type === 'easetag')
                  .map((item) => ({ ...item, preferred: false })),
                method,
              ],
              preferredMethod: method,
              readinessStatus: 'ready',
            }
          : current,
      )
      queryClient.setQueryData<PayrollConnectionsResponse>(listKey, (current) =>
        current
          ? {
              ...current,
              connections: current.connections.map((connection) =>
                connection.id === ownerId
                  ? {
                      ...connection,
                      preferredMethod: method,
                      methods: [
                        ...(connection.methods ?? [])
                          .filter((item) => item.type === 'easetag')
                          .map((item) => ({ ...item, preferred: false })),
                        method,
                      ],
                    }
                  : connection,
              ),
            }
          : current,
      )
      void queryClient.invalidateQueries({ queryKey: detailKey, exact: true })
    } else {
      queryClient.setQueryData<PayrollConnectionsResponse>(listKey, (current) =>
        current
          ? {
              ...current,
              pendingInvitations: (current.pendingInvitations ?? []).map((invitation) =>
                invitation.id === ownerId
                  ? {
                      ...invitation,
                      methods: [...invitation.methods.filter((item) => item.type === 'easetag'), method],
                    }
                  : invitation,
              ),
            }
          : current,
      )
    }
    void queryClient.invalidateQueries({ queryKey: listKey })
    haptics.success()
    if (context === 'invitation' && navigation.popTo) {
      navigation.popTo('PayrollInvitation', {
        invitationId: ownerId,
        selectedMethodId: method.id,
      })
    } else {
      navigation.goBack()
    }
  }

  if (!ownerId || (context !== 'connection' && context !== 'invitation')) {
    return (
      <ScreenWrapper>
        <View style={styles.invalid}>
          <Text style={styles.invalidText}>This Payroll receiving-method flow is no longer available.</Text>
        </View>
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper>
      <View style={styles.backdrop} />
      <PayrollReceivingMethodSheet
        visible
        invitationId={context === 'invitation' ? ownerId : undefined}
        connectionId={context === 'connection' ? ownerId : undefined}
        editingMethod={
          existingMethod && existingMethod.type !== 'easetag'
            ? {
                id: existingMethod.id,
                type: existingMethod.type as PayrollExternalMethodType,
                label: existingMethod.label,
                details: existingMethod.details,
              }
            : null
        }
        onClose={() => navigation.goBack()}
        onSaved={saved}
      />
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.background.primary },
  invalid: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  invalidText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    textAlign: 'center',
  },
})
