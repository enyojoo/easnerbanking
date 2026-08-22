import React, { Suspense, lazy, type ComponentType } from 'react'
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native'
import { colors } from '../theme'
import { importWebScreen } from './importWebScreen'

function WebLazyFallback() {
  return (
    <View style={styles.fallback}>
      <ActivityIndicator size="small" color={colors.primary.main} />
    </View>
  )
}

/**
 * On web, load the screen via dynamic import (async chunk). On native, use the
 * statically imported component so cold start stays unchanged.
 */
export function createWebLazyScreen<P extends object>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  NativeComponent: ComponentType<P>,
): ComponentType<P> {
  if (Platform.OS !== 'web') {
    return NativeComponent
  }

  const LazyComponent = lazy(() => importWebScreen(importFn))

  function WebLazyScreen(props: P) {
    return (
      <Suspense fallback={<WebLazyFallback />}>
        <LazyComponent {...props} />
      </Suspense>
    )
  }

  return WebLazyScreen as ComponentType<P>
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.primary,
  },
})
