import React, { useEffect, useReducer } from 'react'
import { Text, StyleSheet, View, TextStyle, ViewStyle } from 'react-native'
import { UX } from '@easner/shared'
import { useThemeColors } from '../../contexts/ThemePaletteContext'
import { fontFamily } from '../../theme'

/**
 * Mobile twin of the web `RefreshedAt` label.
 *
 * Stays silent while data is fresh; once `dataUpdatedAt` crosses
 * `UX.refreshHint.showWhenUpdatedAtOlderThanMs` it renders a quiet
 * "Updated Xs ago" line. After `UX.refreshHint.staleThresholdMs` it
 * upgrades to the palette warning tone.
 */

type Props = {
  dataUpdatedAt: number | undefined
  isFetching?: boolean
  style?: ViewStyle
  textStyle?: TextStyle
}

function formatAge(ageMs: number): string {
  const s = Math.round(ageMs / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

export function RefreshedAt({ dataUpdatedAt, isFetching, style, textStyle }: Props) {
  const colors = useThemeColors()
  const [, force] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const id = setInterval(() => force(), 30_000)
    return () => clearInterval(id)
  }, [])

  if (!dataUpdatedAt) return null
  const age = Date.now() - dataUpdatedAt
  if (age < UX.refreshHint.showWhenUpdatedAtOlderThanMs && !isFetching) return null
  const stale = age >= UX.refreshHint.staleThresholdMs
  const tint = stale ? colors.warning.main : colors.text.tertiary
  return (
    <View style={[styles.row, style]}>
      {isFetching ? (
        <View style={[styles.dot, { backgroundColor: tint }]} />
      ) : null}
      <Text style={[styles.text, { color: tint }, textStyle]}>
        Updated {formatAge(age)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, opacity: 0.8 },
  text: { fontFamily: fontFamily.medium, fontSize: 11 },
})
