import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { colors, borderRadius, spacing, textStyles } from '../theme'
import { CONSUMER_TIER_LADDER } from '../lib/compliance-tier-ladder-copy'
import { isTier1Complete } from '../lib/compliance'

type Props = {
  userProfile: Parameters<typeof isTier1Complete>[0]
}

export function ComplianceTierLadder({ userProfile }: Props) {
  const t1Done = isTier1Complete(userProfile)

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>Easner tiers</Text>
      <Text style={styles.sectionSubtitle}>
        Global banking, African markets, and cards unlock as we roll out each program.
      </Text>
      {CONSUMER_TIER_LADDER.tiers.map((t) => {
        const isT1 = t.tier === 1
        return (
          <View
            key={t.tier}
            style={[styles.card, isT1 && styles.cardTier1]}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{t.title}</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Tier {t.tier}</Text>
              </View>
              {isT1 ? (
                <View style={[styles.statusPill, t1Done ? styles.statusOk : styles.statusPending]}>
                  <Text style={styles.statusPillText}>{t1Done ? 'Unlocked' : 'Action needed'}</Text>
                </View>
              ) : (
                <View style={styles.comingBadge}>
                  <Text style={styles.comingBadgeText}>Coming later</Text>
                </View>
              )}
            </View>
            <Text style={styles.cardBody}>{t.description}</Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  sectionTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
  },
  sectionSubtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginBottom: spacing[1],
  },
  card: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.frame.border,
    backgroundColor: colors.background.secondary,
    padding: spacing[4],
  },
  cardTier1: {
    borderColor: 'rgba(29, 79, 243, 0.35)',
    backgroundColor: 'rgba(29, 79, 243, 0.04)',
  },
  cardHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  cardTitle: {
    ...textStyles.labelLarge,
    color: colors.text.primary,
    fontFamily: 'Outfit-SemiBold',
    flex: 1,
    minWidth: 120,
  },
  badge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.frame.border,
    backgroundColor: colors.background.primary,
  },
  badgeText: {
    ...textStyles.bodySmall,
    fontSize: 11,
    color: colors.text.secondary,
    fontFamily: 'Outfit-Medium',
  },
  statusPill: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  statusOk: {
    backgroundColor: '#10B98120',
  },
  statusPending: {
    backgroundColor: '#F59E0B20',
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: 'Outfit-SemiBold',
    color: colors.text.primary,
  },
  comingBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.neutral[100],
  },
  comingBadgeText: {
    fontSize: 11,
    fontFamily: 'Outfit-Medium',
    color: colors.text.secondary,
  },
  cardBody: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    lineHeight: 20,
  },
})
