import { View, StyleSheet } from 'react-native'
import { getCountryCodeForCurrency } from '@easner/shared'
import type { Recipient } from '../types'
import { isWalletSendRecipient } from '../lib/recipientWalletMeta'
import { getTokenIconUrl } from '../lib/cryptoIcons'
import { CachedImage } from './CachedImage'
import { CountryFlag } from './flags/CountryFlag'
import { colors } from '../theme'

type Props = {
  recipient: Recipient
  size?: number
}

/** Full token or country flag avatar — no corner badge (send chip + recipient lists). */
export function PayoutRecipientAvatar({ recipient, size = 36 }: Props) {
  const isWalletRecipient = isWalletSendRecipient(recipient)
  const tokenIcon = getTokenIconUrl(recipient.currency)
  const countryCode =
    recipient.country_code ||
    (recipient.currency === 'EUR' ? 'EU' : getCountryCodeForCurrency(recipient.currency) || 'US')

  const radius = size / 2

  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: radius,
        },
      ]}
    >
      {isWalletRecipient && tokenIcon ? (
        <CachedImage uri={tokenIcon} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <CountryFlag code={countryCode} size={size} style={{ width: size, height: size }} contentFit="cover" />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: colors.primary.main + '15',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.frame.border,
  },
})
