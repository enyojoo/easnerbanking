import React from 'react'
import { View, StyleSheet } from 'react-native'
import SkeletonLoader from '../SkeletonLoader'
import { borderRadius, spacing } from '../../theme'

/** Matches business `PaymentFormSkeleton` used in Easner checkout. */
export function ExpressPaymentFormSkeleton() {
  return (
    <View style={styles.root} accessibilityLabel="Loading payment methods" accessibilityState={{ busy: true }}>
      <SkeletonLoader height={44} borderRadius={borderRadius.lg} />
      <SkeletonLoader height={44} borderRadius={borderRadius.lg} />
      <View style={styles.fieldGroup}>
        <SkeletonLoader width={96} height={16} borderRadius={borderRadius.sm} />
        <SkeletonLoader height={40} borderRadius={borderRadius.lg} />
      </View>
      <View style={styles.fieldGroup}>
        <SkeletonLoader width={80} height={16} borderRadius={borderRadius.sm} />
        <SkeletonLoader height={40} borderRadius={borderRadius.lg} />
      </View>
      <SkeletonLoader height={44} borderRadius={borderRadius.lg} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  fieldGroup: { gap: spacing[2], paddingTop: spacing[1] },
})
