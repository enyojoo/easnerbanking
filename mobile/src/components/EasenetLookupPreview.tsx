import { View, Text, Image, StyleSheet } from 'react-native'
import { EasenetSubtitleRow } from '../lib/easenetRecipientUi'
import { EASNER_MARK_URL } from '../lib/easnerBrand'
import { colors, spacing, borderRadius, textStyles } from '../theme'

export type EasenetLookupProfile = {
  fullName: string
  easetag: string
  accountKind: 'business' | 'personal'
  avatarUrl: string | null
}

type Props = {
  profile: EasenetLookupProfile
  getInitials: (name: string) => string
}

/** Matches send-hub easetag row: photo + Easner badge + name + Business/Personal • @tag */
export function EasenetLookupPreview({ profile, getInitials }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.avatarWrap}>
        {profile.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImg} resizeMode="cover" />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitials}>{getInitials(profile.fullName)}</Text>
          </View>
        )}
        <View style={styles.markBadge}>
          <Image
            source={{ uri: EASNER_MARK_URL }}
            style={styles.markImg}
            resizeMode="cover"
          />
        </View>
      </View>
      <View style={styles.textCol}>
        <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
          {profile.fullName}
        </Text>
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
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.frame.border,
    backgroundColor: colors.frame.background,
    marginBottom: spacing[3],
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
    fontFamily: 'Outfit-SemiBold',
  },
  markBadge: {
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
  markImg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 10,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
  },
  tagLine: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontFamily: 'Outfit-Regular',
    marginTop: 2,
  },
})
