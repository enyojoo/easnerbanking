import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { EasenetSubtitleRow } from '../lib/easenetRecipientUi'
import { normalizeAvatarUrl } from '../lib/avatarCache'
import { CachedImage } from './CachedImage'
import { EasnerMarkBadge } from './EasnerMarkBadge'
import { colors, spacing, borderRadius, textStyles, fontFamily, surfaceFrameStyle } from '../theme'

export type EasenetLookupProfile = {
  fullName: string
  easetag: string
  /** From API when known; omit until hydrated so we don’t default to “Personal” incorrectly. */
  accountKind?: 'business' | 'personal' | null
  avatarUrl: string | null
}

type Props = {
  profile: EasenetLookupProfile
  getInitials: (name: string) => string
  /** `card` = bordered block (forms). `row` = inline list row (recipients / send hub). */
  variant?: 'card' | 'row'
  /** Shown after the display name on the same row (e.g. Recent / New badges). */
  titleEndAccessory?: ReactNode
}

/** Avatar + Easner mark + name + Business/Personal • @tag (matches easetag search preview). */
export function EasenetLookupPreview({
  profile,
  getInitials,
  variant = 'card',
  titleEndAccessory,
}: Props) {
  const row = variant === 'row'
  const uri = normalizeAvatarUrl(profile.avatarUrl)
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => {
    setImageFailed(false)
  }, [uri])

  return (
    <View style={[styles.wrap, row && styles.wrapRow]}>
      <View style={styles.avatarWrap}>
        {uri && !imageFailed ? (
          <CachedImage
            uri={uri}
            style={styles.avatarImg}
            contentFit="cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitials}>{getInitials(profile.fullName)}</Text>
          </View>
        )}
        <View style={styles.markBadge}>
          <EasnerMarkBadge />
        </View>
      </View>
      <View style={styles.textCol}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, row && styles.nameFlex]} numberOfLines={1} ellipsizeMode="tail">
            {profile.fullName}
          </Text>
          {titleEndAccessory ? <View style={styles.titleEnd}>{titleEndAccessory}</View> : null}
        </View>
        <EasenetSubtitleRow
          easetag={profile.easetag}
          accountKind={profile.accountKind}
          textStyle={styles.tagLine}
          gap={4}
        />
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
  markBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    zIndex: 3,
    elevation: 3,
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
