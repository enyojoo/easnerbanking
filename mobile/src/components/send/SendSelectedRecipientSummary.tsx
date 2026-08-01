import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { ProfileAvatarCircle } from '../ProfileAvatarCircle'
import { PayoutRecipientAvatar } from '../PayoutRecipientAvatar'
import { colors, textStyles, spacing, fontFamily } from '../../theme'
import type { Recipient } from '../../types'
import {
  EasenetSubtitleRow,
  isEasenetRecipientRecord,
  PayoutSubtitleRow,
  resolveRecipientEasetagForUi,
} from '../../lib/easenetRecipientUi'
import { isEasetagHandleValue } from '@easner/shared'
import { getPayoutRecipientSubtitleParts } from '../../lib/recipientPayoutPreview'
import type { HydratedEasenetProfile } from '../../hooks/useEasenetRecipientHydration'

function recipientInitials(fullName: string): string {
  const parts = fullName.trim().split(' ').filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function EasenetRecipientAvatar({
  recipient,
  easenetPreview,
}: {
  recipient: Recipient
  easenetPreview?: HydratedEasenetProfile | null
}) {
  const displayName = (easenetPreview?.fullName || recipient.full_name).trim()
  const tag = resolveRecipientEasetagForUi(recipient)
  const avatarName =
    String(easenetPreview?.fullName ?? '').trim() ||
    (displayName && !isEasetagHandleValue(displayName, tag) ? displayName : tag)
  const uri = String(easenetPreview?.avatarUrl || recipient.payee_avatar_url || '').trim()
  return (
    <View style={styles.avatarCircle}>
      <ProfileAvatarCircle
        avatarUrl={uri || null}
        style={styles.avatarFill}
        imageStyle={styles.avatarFill}
        fallback={<Text style={styles.avatarInitials}>{recipientInitials(avatarName)}</Text>}
      />
    </View>
  )
}

/** Avatar + display name + Easetag or payout subtitle (amount + confirm screens). */
export function SendSelectedRecipientSummary({
  recipient,
  easenetPreview,
  alignEnd = false,
}: {
  recipient: Recipient
  easenetPreview?: HydratedEasenetProfile | null
  /** Review/confirm: align chip flush right with amount values. */
  alignEnd?: boolean
}) {
  const isEasenet = isEasenetRecipientRecord(recipient)
  const easetag = resolveRecipientEasetagForUi(recipient)
  const hydratedName = String(easenetPreview?.fullName ?? '').trim()
  const storedName = String(recipient.full_name ?? '').trim()
  const displayName = isEasenet
    ? hydratedName ||
      (storedName && !isEasetagHandleValue(storedName, easetag) ? storedName : '')
    : storedName

  if (alignEnd) {
    return (
      <View style={styles.rootAlignEnd}>
        <View style={styles.infoAlignEnd}>
          <Text style={[styles.name, styles.textAlignEnd]} numberOfLines={1} ellipsizeMode="tail">
            {displayName}
          </Text>
          {isEasenet ? (
            <EasenetSubtitleRow
              easetag={resolveRecipientEasetagForUi(recipient)}
              accountKind={easenetPreview?.accountKind ?? recipient.payee_account_kind}
              textStyle={styles.details}
              gap={4}
            />
          ) : (
            <PayoutSubtitleRow
              {...getPayoutRecipientSubtitleParts(recipient)}
              textStyle={styles.details}
              gap={4}
            />
          )}
        </View>
        <View style={styles.avatarSlot}>
          {isEasenet ? (
            <EasenetRecipientAvatar recipient={recipient} easenetPreview={easenetPreview} />
          ) : (
            <PayoutRecipientAvatar recipient={recipient} size={36} />
          )}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <View style={styles.avatarSlot}>
        {isEasenet ? (
          <EasenetRecipientAvatar recipient={recipient} easenetPreview={easenetPreview} />
        ) : (
          <PayoutRecipientAvatar recipient={recipient} size={36} />
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
          {displayName}
        </Text>
        {isEasenet ? (
          <EasenetSubtitleRow
            easetag={resolveRecipientEasetagForUi(recipient)}
            accountKind={easenetPreview?.accountKind ?? recipient.payee_account_kind}
            textStyle={styles.details}
            gap={4}
          />
        ) : (
          <PayoutSubtitleRow
            {...getPayoutRecipientSubtitleParts(recipient)}
            textStyle={styles.details}
            gap={4}
          />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minWidth: 0,
    flex: 1,
  },
  rootAlignEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing[3],
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  avatarSlot: {
    flexShrink: 0,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  infoAlignEnd: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
    alignItems: 'flex-end',
  },
  textAlignEnd: {
    textAlign: 'right',
  },
  name: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontFamily: fontFamily.semibold,
    lineHeight: 18,
  },
  details: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: fontFamily.regular,
    lineHeight: 16,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary.main + '15',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.frame.border,
  },
  avatarFill: {
    width: 36,
    height: 36,
    borderRadius: 0,
  },
  avatarInitials: {
    ...textStyles.titleSmall,
    color: colors.primary.main,
    fontFamily: fontFamily.semibold,
    fontWeight: '700',
  },
})
