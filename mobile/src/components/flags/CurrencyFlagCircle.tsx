import React, { useEffect } from 'react'
import { View, StyleSheet, type ViewStyle } from 'react-native'
import { CurrencyFlag } from './CurrencyFlag'
import { warmNativeCurrencyAssets } from '../../lib/warmBundledFlagCache'
import { colors, surfaceChromeCircleStyle } from '../../theme'

type Props = {
  currency: string
  /** Diameter in px – matches send confirm / dashboard balance chips. */
  size?: number
  style?: ViewStyle
}

/** Circular filled currency flag – same chrome as payout review "From" / dashboard balance. */
export function CurrencyFlagCircle({ currency, size = 22, style }: Props) {
  // Warm the remote token logo for crypto currencies (flags are bundled and
  // need no warming) — mirrors business web's CurrencyFlagCircle.
  useEffect(() => {
    warmNativeCurrencyAssets(currency)
  }, [currency])

  return (
    <View style={[surfaceChromeCircleStyle(colors, size, { shadow: 'none' }), styles.clip, style]}>
      <CurrencyFlag
        currency={currency}
        size={size}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
})
