import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import type { Recipient } from '../types'
import { getPayoutRecipientSubtitleParts } from '../lib/recipientPayoutPreview'
import { getTokenIconUrl } from '../lib/cryptoIcons'
import { PayoutSubtitleRow } from '../lib/easenetRecipientUi'
import { avatarImageSource } from '../lib/avatarCache'
import { CountryFlag } from './flags/CountryFlag'
import { getCountryCodeForCurrency } from '@easner/shared'
import { colors, spacing, borderRadius, textStyles, fontFamily, surfaceFrameStyle } from '../theme'

type Props = {
  recipient: Recipient
  getInitials: (name: string) => string
  variant?: 'card' | 'row'
  titleEndAccessory?: ReactNode
}

/**
 * Same structure as Easenet preview: avatar + corner badge (flag / token) + name + `Label • detail`
 * (mobile money, bank account, crypto wallet — not Easenet).
 */
export function RecipientPayoutPreview({ recipient, getInitials, variant = 'card', titleEndAccessory }: Props) {
  const row = variant === 'row'
  const isWalletRecipient = String(recipient.bank_name || '').toLowerCase().includes('wallet')
  const tokenIcon = getTokenIconUrl(recipient.currency)
  const countryCode =
    recipient.country_code ||
    (recipient.currency === 'EUR' ? 'EU' : getCountryCodeForCurrency(recipient.currency) || 'US')

  const uri = String(recipient.payee_avatar_url || '').trim()
  const avatarSource = avatarImageSource(uri)
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => {
    setImageFailed(false)
  }, [uri])

  const { left, right } = getPayoutRecipientSubtitleParts(recipient)

  return (
    <View style={[styles.wrap, row && styles.wrapRow]}>
      <View style={styles.avatarWrap}>
        {avatarSource && !imageFailed ? (
          <Image
            source={{ uri: avatarSource.uri }}
            style={styles.avatarImg}
            contentFit="cover"
            cachePolicy="disk"
            transition={0}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitials}>{getInitials(recipient.full_name)}</Text>
          </View>
        )}
        <View style={styles.cornerBadge}>
          {isWalletRecipient && tokenIcon ? (
            <Image source={{ uri: tokenIcon }} style={styles.badgeFill} contentFit="cover" />
          ) : (
            <CountryFlag code={countryCode} size={20} style={styles.badgeFill} />
          )}
        </View>
      </View>
      <View style={styles.textCol}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, row && styles.nameFlex]} numberOfLines={1} ellipsizeMode="tail">
            {recipient.full_name}
          </Text>
          {titleEndAccessory ? <View style={styles.titleEnd}>{titleEndAccessory}</View> : null}
        </View>
        <PayoutSubtitleRow left={left} right={right} textStyle={styles.tagLine} gap={4} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    ...surfaceFrameStyle(colors, { shadow: 'none', radius: borderRadius.lg }),
    marginBottom: spacing[3],
  },
  wrapRow: {
    padding: 0,
    marginBottom: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minWidth: 0,
  },
  nameFlex: {
    flex: 1,
    minWidth: 0,
  },
  titleEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarWrap: {
    position: 'relative',
    marginRight: spacing[3],
  },
  avatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.neutral[100],
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary.main + '18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    ...textStyles.titleSmall,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
  },
  cornerBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    zIndex: 3,
    elevation: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.background.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background.primary,
    overflow: 'hidden',
  },
  badgeFill: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
  },
  tagLine: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
    marginTop: 2,
  },
})
