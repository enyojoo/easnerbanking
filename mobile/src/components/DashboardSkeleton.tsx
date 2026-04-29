import React from 'react'
import { View, StyleSheet, ScrollView } from 'react-native'
import ScreenWrapper from './ScreenWrapper'
import ShimmerLoader, { ShimmerText } from './premium/ShimmerLoader'
import { ListRowSkeleton } from './skeletons/ListRowSkeleton'
import { colors, spacing, borderRadius, surfaceFrameStyle, shadows } from '../theme'

/**
 * Full-screen placeholder matching the redesigned home layout: top bar (avatar + support),
 * gradient hero block, recent-activity SectionCard with row-shaped shimmers.
 */
const DashboardSkeleton: React.FC = () => {
  return (
    <ScreenWrapper>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <ShimmerLoader width={40} height={40} borderRadius={20} />
          <View style={styles.headerSpacer} />
          <ShimmerLoader width={40} height={40} borderRadius={20} />
        </View>

        <ShimmerLoader
          width="100%"
          height={200}
          borderRadius={borderRadius['3xl']}
          style={styles.heroShimmer}
        />

        <View style={styles.recentCard}>
          <View style={styles.recentHeader}>
            <ShimmerText width={120} height={18} />
            <ShimmerLoader width={72} height={16} borderRadius={borderRadius.sm} />
          </View>
          {[0, 1, 2].map((i) => (
            <ListRowSkeleton key={i} variant="transaction" showDivider={i < 2} />
          ))}
        </View>
      </ScrollView>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.semantic.background,
  },
  scrollContent: {
    paddingBottom: spacing[8],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    paddingBottom: spacing[2],
  },
  headerSpacer: {
    flex: 1,
  },
  heroShimmer: {
    marginHorizontal: spacing[5],
    marginBottom: spacing[4],
    ...shadows.xs,
  },
  recentCard: {
    marginHorizontal: spacing[5],
    ...surfaceFrameStyle(colors, { shadow: 'xs', radius: borderRadius['2xl'] }),
    overflow: 'hidden',
    paddingTop: spacing[2],
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    marginBottom: spacing[1],
  },
})

export default DashboardSkeleton
