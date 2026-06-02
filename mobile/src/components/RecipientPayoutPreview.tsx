import type { ReactNode } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import type { Recipient } from '../types'
import { getPayoutRecipientSubtitleParts } from '../lib/recipientPayoutPreview'
import { PayoutRecipientAvatar } from './PayoutRecipientAvatar'
import { PayoutSubtitleRow } from '../lib/easenetRecipientUi'
import { colors, spacing, borderRadius, textStyles, fontFamily, surfaceFrameStyle } from '../theme'

type Props = {
  recipient: Recipient
  getInitials: (name: string) => string
  variant?: 'card' | 'row'
  titleEndAccessory?: ReactNode
}

/** Payout recipient row — full flag / token avatar + name + subtitle (no corner badge). */
export function RecipientPayoutPreview({ recipient, variant = 'card', titleEndAccessory }: Props) {
  const row = variant === 'row'
  const { left, right } = getPayoutRecipientSubtitleParts(recipient)

  return (
    <View style={[styles.wrap, row && styles.wrapRow]}>
      <View style={styles.avatarWrap}>
        <PayoutRecipientAvatar recipient={recipient} size={48} />
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
    marginRight: spacing[3],
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
