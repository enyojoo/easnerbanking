import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { ArrowRight } from 'lucide-react-native'
import { haptics } from '../../lib/haptics'
import { colors, spacing, fontSize, fontFamily, borderRadius } from '../../theme'

export type StablecoinReceiveMethod = {
  id: string
  asset: string
  network: string
  status: 'active' | 'provisioning' | 'unavailable'
  address?: string
  estimatedFeeBps?: number | null
}

export function ReceiveStablecoinMethodList(props: {
  methods: StablecoinReceiveMethod[]
  onSelect: (method: StablecoinReceiveMethod) => void
}) {
  if (props.methods.length === 0) return null

  return (
    <View style={styles.list}>
      {props.methods.map((method) => (
        <Pressable
          key={method.id}
          style={[styles.row, method.status !== 'active' && styles.rowDisabled]}
          onPressIn={() => method.status === 'active' && haptics.tap()}
          onPress={() => props.onSelect(method)}
          disabled={method.status !== 'active'}
        >
          <View style={styles.rowBody}>
            <Text style={styles.title}>
              {method.asset} · {method.network}
            </Text>
            <Text style={styles.subtitle}>
              {method.status === 'active'
                ? 'Tap to view deposit address'
                : method.status === 'provisioning'
                  ? 'Setting up…'
                  : 'Unavailable'}
            </Text>
            {method.estimatedFeeBps != null && method.status === 'active' ? (
              <Text style={styles.feeNote}>
                Estimated bridge fee: ~{(method.estimatedFeeBps / 100).toFixed(2)}%
              </Text>
            ) : null}
          </View>
          <ArrowRight size={18} color={colors.text.secondary} />
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: spacing[2] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    backgroundColor: colors.background.primary,
  },
  rowDisabled: { opacity: 0.6 },
  rowBody: { flex: 1, paddingRight: spacing[3] },
  title: { fontFamily: fontFamily.medium, fontSize: fontSize.base, color: colors.text.primary },
  subtitle: { marginTop: spacing[1], fontSize: fontSize.sm, color: colors.text.secondary },
  feeNote: { marginTop: spacing[1], fontSize: fontSize.xs, color: colors.text.secondary },
})
