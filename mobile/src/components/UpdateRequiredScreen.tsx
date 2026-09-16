import React from 'react'
import { Linking, Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PressableScale } from 'pressto'
import { nativeStoreListingUrl } from '@easner/shared'
import { BundledImage } from './BundledImage'
import { borderRadius, fontFamily, spacing, textStyles, useThemeColors } from '../theme'
import { haptics } from '../lib/haptics'

const APP_ICON = require('../../assets/icons/ios-light.png') as number

export function UpdateRequiredScreen() {
  const palette = useThemeColors()
  const insets = useSafeAreaInsets()
  const storeUrl =
    Platform.OS === 'ios' ? nativeStoreListingUrl('ios') : nativeStoreListingUrl('android')

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: palette.background.primary,
          paddingTop: insets.top + spacing[8],
          paddingBottom: Math.max(insets.bottom, spacing[5]),
        },
      ]}
    >
      <View style={styles.copy}>
        <View style={[styles.iconWrap, { backgroundColor: palette.primary.main }]}>
          <BundledImage source={APP_ICON} style={styles.icon} resizeMode="cover" />
        </View>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: palette.text.primary }]}
        >
          Update required
        </Text>
        <Text accessibilityRole="text" style={[styles.body, { color: palette.text.secondary }]}>
          This version of Easner is no longer supported. Update to keep using your account.
        </Text>
      </View>
      <View style={styles.footer}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Update Easner"
          onPress={() => {
            haptics.tap()
            void Linking.openURL(storeUrl)
          }}
          style={[styles.cta, { backgroundColor: palette.primary.main }]}
        >
          <Text style={styles.ctaLabel}>Update Easner</Text>
        </PressableScale>
        <Text style={[styles.hint, { color: palette.text.secondary }]}>
          You can also update from the App Store or Google Play.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing[6],
    justifyContent: 'space-between',
  },
  copy: {
    alignItems: 'center',
    paddingTop: spacing[10],
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: spacing[6],
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 88,
    height: 88,
  },
  title: {
    ...textStyles.headlineLarge,
    fontFamily: fontFamily.semibold,
    textAlign: 'center',
  },
  body: {
    ...textStyles.bodyMedium,
    textAlign: 'center',
    marginTop: spacing[3],
    maxWidth: 320,
  },
  footer: {
    gap: spacing[3],
    paddingBottom: spacing[4],
  },
  cta: {
    minHeight: 52,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
  },
  ctaLabel: {
    ...textStyles.titleMedium,
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  hint: {
    ...textStyles.bodySmall,
    textAlign: 'center',
  },
})
