import React from 'react'
import { Platform, View, Text, StyleSheet } from 'react-native'
import * as Application from 'expo-application'
import { usePlatformAccess } from '../hooks/usePlatformAccess'
import { isNativeVersionBelowMin } from '../lib/appVersion'
import { UpdateRequiredScreen } from './UpdateRequiredScreen'
import { colors, spacing } from '../theme'

export function PlatformAccessGate({ children }: { children: React.ReactNode }) {
  const access = usePlatformAccess()
  const nativeVersion = Platform.OS === 'web' ? null : Application.nativeApplicationVersion
  const needsStoreUpdate =
    Platform.OS !== 'web' &&
    isNativeVersionBelowMin(nativeVersion, access.data?.minNativeVersion)

  if (needsStoreUpdate) {
    return <UpdateRequiredScreen />
  }

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
    paddingHorizontal: spacing[8],
    backgroundColor: colors.background.primary,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text.primary,
    textAlign: 'center',
  },
  body: {
    marginTop: spacing[4],
    fontSize: 15,
    lineHeight: 22,
    color: colors.text.secondary,
    textAlign: 'center',
  },
})
