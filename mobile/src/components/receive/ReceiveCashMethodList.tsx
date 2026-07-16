import React from 'react'
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import {
  RECEIVE_CASH_BANK_SUBTITLE,
  receiveInternationalBankTitle,
  receiveLocalBankTitle,
  receiveLocalMomoTitle,
  receiveLocalDepositSubtitle,
} from '@easner/shared'
import { colors, spacing, textStyles } from '../../theme'
import { getCountryName } from '../../lib/countryService'
import { CountryFlag } from '../flags/CountryFlag'
import { ReceiveLocalRailCard } from './ReceiveLocalRailCard'

const FLAG_SIZE = 48

type Props = {
  currency: 'USD' | 'EUR'
  residenceCountry: string
  showBankRow: boolean
  showLocalRows: boolean
  localPayInCurrency: string | null
  bankAvailable: boolean
  momoAvailable: boolean
  localDepositBlocked: boolean
  loading: boolean
  onBankPress: () => void
  onLocalBankPress: () => void
  onLocalMomoPress: () => void
}

function CashMethodFlag({ code }: { code: string }) {
  return (
    <CountryFlag
      code={code}
      size={FLAG_SIZE}
      style={{ width: FLAG_SIZE, height: FLAG_SIZE }}
      contentFit="cover"
    />
  )
}

export function ReceiveCashMethodList({
  currency,
  residenceCountry,
  showBankRow,
  showLocalRows,
  localPayInCurrency,
  bankAvailable,
  momoAvailable,
  localDepositBlocked,
  loading,
  onBankPress,
  onLocalBankPress,
  onLocalMomoPress,
}: Props) {
  const countryName = getCountryName(residenceCountry)
  const localSubtitle = localPayInCurrency
    ? receiveLocalDepositSubtitle(localPayInCurrency)
    : ''
  const intlBankFlagCode = currency === 'USD' ? 'US' : 'EU'

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
          leading={<CashMethodFlag code={intlBankFlagCode} />}
          onPress={onBankPress}
        />
      ) : null}

      {showLocalRows && bankAvailable ? (
        <ReceiveLocalRailCard
          title={receiveLocalBankTitle(countryName)}
          subtitle={localSubtitle}
          leading={<CashMethodFlag code={residenceCountry} />}
          onPress={onLocalBankPress}
          disabled={localDepositBlocked}
        />
      ) : null}

      {showLocalRows && momoAvailable ? (
        <ReceiveLocalRailCard
          title={receiveLocalMomoTitle(countryName)}
          subtitle={localSubtitle}
          leading={<CashMethodFlag code={residenceCountry} />}
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
