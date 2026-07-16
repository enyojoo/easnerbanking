import { useEffect } from 'react'
import { ActivityIndicator, View, StyleSheet } from 'react-native'
import { NavigationProps } from '../../types'
import type { YcPayInRail } from '../../hooks/useYcCrossBorderFlow'

type RouteParams = {
  flowMode?: 'fund_balance' | 'cross_border_send'
  transactionId: string
  transferId: string
  localPayIn: number
  sendCurrency: string
  receiveAmount: number
  receiveCurrency: string
  residenceCountry?: string
  payInRail?: YcPayInRail
  customerRate?: number
  bankInfo?: Record<string, unknown> | null
  payInNotice?: string
  processingFeeLocal?: number
  displayProcessingFee?: number
  processingFee?: number
  sourcePhone?: string
  sourceNetworkName?: string
  recipientName?: string
}

/** @deprecated Happy path uses YcPayIn (quote lock). Deep links redirect here. */
export default function YcPayInAuthorizeScreen({ navigation, route }: NavigationProps) {
  const params = (route.params || {}) as Partial<RouteParams>

  useEffect(() => {
    navigation.replace('YcPayIn', {
      flowMode: params.flowMode ?? 'fund_balance',
      transactionId: params.transactionId ?? '',
      transferId: params.transferId ?? '',
      localPayIn: params.localPayIn ?? 0,
      sendCurrency: params.sendCurrency ?? 'NGN',
      sendAmount: params.localPayIn,
      receiveAmount: params.receiveAmount ?? 0,
      receiveCurrency: params.receiveCurrency ?? 'USD',
      customerRate: params.customerRate ?? 0,
      bankInfo: params.bankInfo ?? null,
      payInNotice: params.payInNotice,
      payInRail: params.payInRail ?? 'mobile_money',
      residenceCountry: params.residenceCountry,
      processingFeeLocal: params.processingFeeLocal,
      displayProcessingFee: params.displayProcessingFee,
      processingFee: params.processingFee,
      sourcePhone: params.sourcePhone,
      sourceNetworkName: params.sourceNetworkName,
      recipientName: params.recipientName,
    })
  }, [navigation, params])

  return (
    <View style={styles.center}>
      <ActivityIndicator />
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
