import React, { useEffect, useRef } from 'react'
import { View } from 'react-native'
import ScreenWrapper from '../../components/ScreenWrapper'
import { NavigationProps } from '../../types'
import { readPayrollApprovalToken, storePayrollApprovalToken } from '../../lib/payrollApprovalTokenStore'

/**
 * Compatibility route for older navigation calls and the canonical /payroll
 * deep link. New UI enters through PayrollConnections, PayrollInvitation and
 * PayrollConnectionDetail.
 */
export default function PayrollApprovalScreen({ navigation, route }: NavigationProps) {
  const redirected = useRef(false)

  useEffect(() => {
    if (redirected.current) return
    redirected.current = true
    const token = typeof route.params?.token === 'string' ? route.params.token : ''
    const invitationId = typeof route.params?.invitationId === 'string' ? route.params.invitationId : ''
    const connectionId = typeof route.params?.connectionId === 'string' ? route.params.connectionId : ''

    void (async () => {
      if (token) {
        await storePayrollApprovalToken(token)
        navigation.setParams?.({ token: undefined })
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', '/payroll')
        }
      }
      const storedToken = token || (await readPayrollApprovalToken())
      navigation.replace('PayrollConnections')
      requestAnimationFrame(() => {
        if (connectionId) {
          navigation.navigate('PayrollConnectionDetail', { connectionId })
          return
        }
        if (invitationId || storedToken) {
          navigation.navigate('PayrollInvitation', {
            ...(invitationId ? { invitationId } : {}),
          })
          return
        }
      })
    })()
  }, [navigation, route.params?.connectionId, route.params?.invitationId, route.params?.token])

  return (
    <ScreenWrapper>
      <View style={{ flex: 1 }} />
    </ScreenWrapper>
  )
}
