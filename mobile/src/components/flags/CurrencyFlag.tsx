import React from 'react'
import { Image, ImageSourcePropType, StyleSheet, Text, View } from 'react-native'
import { getCountryCodeForCurrency } from '@easner/shared'
import { colors } from '../../theme'

const countryToFlagAsset: Record<string, ImageSourcePropType> = {
  US: require('../../../assets/flags/us.png'),
  EU: require('../../../assets/flags/eu.png'),
  GB: require('../../../assets/flags/gb.png'),
  NG: require('../../../assets/flags/ng.png'),
  KE: require('../../../assets/flags/ke.png'),
  GH: require('../../../assets/flags/gh.png'),
  RU: require('../../../assets/flags/ru.png'),
}

type CurrencyFlagProps = {
  currency: string
  size?: number
  style?: any
}

export function CurrencyFlag({ currency, size = 20, style }: CurrencyFlagProps) {
  const code = String(currency || '').trim().toUpperCase()
  const iso = code === 'EUR' ? 'EU' : getCountryCodeForCurrency(code) || ''
  const source = iso ? countryToFlagAsset[iso] : undefined

  if (!source) {
    return (
      <View style={[styles.fallback, { width: size, height: Math.round(size * 0.75) }, style]}>
        <Text style={styles.fallbackText}>{code.slice(0, 2) || '--'}</Text>
      </View>
    )
  }

  return (
    <Image
      source={source}
      style={[{ width: size, height: Math.round(size * 0.75), borderRadius: 4 }, style]}
      resizeMode="cover"
    />
  )
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.frame.background,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    fontSize: 10,
    color: colors.text.secondary,
    fontWeight: '600',
  },
})

