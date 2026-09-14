import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { usePlatformAccess } from '../hooks/usePlatformAccess'
import { colors, spacing } from '../theme'

export function PlatformAccessGate({ children }: { children: React.ReactNode }) {
  const access = usePlatformAccess()
  if (access.data?.maintenance) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>We’ll be back shortly</Text>
        <Text style={styles.body}>{access.data.maintenanceMessage}</Text>
      </View>
    )
  }
  return <>{children}</>
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.background.primary,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text.primary,
    textAlign: 'center',
  },
  body: {
    marginTop: spacing.md,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text.secondary,
    textAlign: 'center',
  },
})
