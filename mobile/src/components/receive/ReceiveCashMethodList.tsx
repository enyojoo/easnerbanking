import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import {
  receiveInternationalBankTitle,
  receiveInternationalDepositSubtitle,
  receiveLocalBankTitle,
  receiveLocalMomoTitle,
  receiveLocalDepositSubtitle,
  mapResidenceToLocalPayInCurrency,
  EXPRESS_DEPOSITS_COPY,
  expressDepositMethodTitle,
  type CashPayInMethodKind,
} from '@easner/shared'
import { colors, spacing, textStyles } from '../../theme'
import { getCountryName } from '../../lib/countryService'
import { CountryFlag } from '../flags/CountryFlag'
import { ReceiveLocalRailCard } from './ReceiveLocalRailCard'

const FLAG_SIZE = 48

export type ExpressCashKind = Extract<
  CashPayInMethodKind,
  'express_card' | 'express_apple_pay' | 'express_google_pay' | 'express_ach'
>

type Props = {
  currency: 'USD' | 'EUR'
  residenceCountry: string
  showBankRow: boolean
  showLocalRows: boolean
  localPayInCurrency: string | null
  bankAvailable: boolean
  momoAvailable: boolean
  localDepositBlocked: boolean
  extraLocalCountries?: string[]
  expressMethods?: ExpressCashKind[]
  expressReady?: boolean
  expressFlagCode?: string
  onBankPress: () => void
  onLocalBankPress: (country?: string) => void
  onLocalMomoPress: () => void
  onExpressPress?: (kind: ExpressCashKind) => void
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
  extraLocalCountries = [],
  expressMethods = [],
  expressReady = false,
  expressFlagCode = "US",
  onBankPress,
  onLocalBankPress,
  onLocalMomoPress,
  onExpressPress,
}: Props) {
  const countryName = getCountryName(residenceCountry)
  const localSubtitle = localPayInCurrency
    ? receiveLocalDepositSubtitle(localPayInCurrency)
    : ''
  const intlBankFlagCode = currency === 'USD' ? 'US' : 'EU'

  const hasAnyRow =
    showBankRow ||
    (showLocalRows && (bankAvailable || momoAvailable)) ||
    extraLocalCountries.length > 0 ||
    expressMethods.length > 0

  if (!hasAnyRow) {
    return (
      <Text style={styles.unavailable}>
        {showLocalRows
          ? 'Local pay-in is not available for your country right now.'
          : 'Cash deposit methods are not available right now.'}
      </Text>
    )
  }

  return (
    <View style={styles.list}>
      {showBankRow ? (
        <ReceiveLocalRailCard
          title={receiveInternationalBankTitle(currency)}
          subtitle={receiveInternationalDepositSubtitle(currency)}
          leading={<CashMethodFlag code={intlBankFlagCode} />}
          onPress={onBankPress}
        />
      ) : null}

      {showLocalRows && bankAvailable ? (
        <ReceiveLocalRailCard
          title={receiveLocalBankTitle(countryName)}
          subtitle={localSubtitle}
          leading={<CashMethodFlag code={residenceCountry} />}
          onPress={() => onLocalBankPress()}
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

      {extraLocalCountries.map((cc) => {
        const cur = mapResidenceToLocalPayInCurrency(cc)
        return (
          <ReceiveLocalRailCard
            key={cc}
            title={receiveLocalBankTitle(getCountryName(cc))}
            subtitle={cur ? receiveLocalDepositSubtitle(cur) : ''}
            leading={<CashMethodFlag code={cc} />}
            onPress={() => onLocalBankPress(cc)}
          />
        )
      })}

      {expressMethods.map((kind) => (
        <ReceiveLocalRailCard
          key={kind}
          title={expressDepositMethodTitle(kind)}
          subtitle={
            expressReady ? EXPRESS_DEPOSITS_COPY.description : EXPRESS_DEPOSITS_COPY.setupRequiredHint
          }
          leading={<CashMethodFlag code={expressFlagCode} />}
          onPress={() => onExpressPress?.(kind)}
        />
      ))}
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
