import React from 'react'
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { Landmark, Smartphone } from 'lucide-react-native'
import {
  RECEIVE_CASH_BANK_SUBTITLE,
  RECEIVE_CASH_MOMO_SUBTITLE,
  receiveInternationalBankTitle,
  receiveLocalBankTitle,
  receiveLocalMomoTitle,
} from '@easner/shared'
import { colors, spacing, textStyles } from '../../theme'
import { getCountryName } from '../../lib/countryService'
import { ReceiveLocalRailCard } from './ReceiveLocalRailCard'

type Props = {
  currency: 'USD' | 'EUR'
  residenceCountry: string
  showBankRow: boolean
  showLocalRows: boolean
  bankAvailable: boolean
  momoAvailable: boolean
  localDepositBlocked: boolean
  loading: boolean
  onBankPress: () => void
  onLocalBankPress: () => void
  onLocalMomoPress: () => void
}

export function ReceiveCashMethodList({
  currency,
  residenceCountry,
  showBankRow,
  showLocalRows,
  bankAvailable,
  momoAvailable,
  localDepositBlocked,
  loading,
  onBankPress,
  onLocalBankPress,
  onLocalMomoPress,
}: Props) {
  const countryName = getCountryName(residenceCountry)

  if (loading && showLocalRows && !bankAvailable && !momoAvailable) {
    return <ActivityIndicator color={colors.primary.main} style={{ marginVertical: spacing[6] }} />
  }

  const hasAnyRow =
    showBankRow || (showLocalRows && (bankAvailable || momoAvailable))

  if (!hasAnyRow) {
    return (
      <Text style={styles.unavailable}>
        Cash deposit methods are not available right now.
      </Text>
    )
  }

  return (
    <View style={styles.list}>
      {showBankRow ? (
        <ReceiveLocalRailCard
          title={receiveInternationalBankTitle(currency)}
          subtitle={RECEIVE_CASH_BANK_SUBTITLE}
          icon={<Landmark size={24} color={colors.primary.main} strokeWidth={2} />}
          onPress={onBankPress}
        />
      ) : null}

      {showLocalRows && bankAvailable ? (
        <ReceiveLocalRailCard
          title={receiveLocalBankTitle(countryName)}
          subtitle={RECEIVE_CASH_BANK_SUBTITLE}
          icon={<Landmark size={24} color={colors.primary.main} strokeWidth={2} />}
          onPress={onLocalBankPress}
          disabled={localDepositBlocked}
        />
      ) : null}

      {showLocalRows && momoAvailable ? (
        <ReceiveLocalRailCard
          title={receiveLocalMomoTitle(countryName)}
          subtitle={RECEIVE_CASH_MOMO_SUBTITLE}
          icon={<Smartphone size={24} color={colors.primary.main} strokeWidth={2} />}
          onPress={onLocalMomoPress}
          disabled={localDepositBlocked}
        />
      ) : null}

      {showLocalRows && !loading && !bankAvailable && !momoAvailable ? (
        <Text style={styles.unavailable}>
          Local pay-in is not available for your country right now.
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: spacing[3],
  },
  unavailable: {
    ...textStyles.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing[4],
  },
})
