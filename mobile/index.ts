// Must be first: native splash failsafe before PostHog / AppNavigator evaluate.
import './src/lib/splashBoot';
import './src/lib/coldStartMetrics';
import './src/lib/backgroundTasks';
import { installStaleWebBundleReload } from './src/lib/reloadStaleWebBundle';

installStaleWebBundleReload();
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { registerRootComponent } from 'expo';

/**
 * Load App on the next tick so splashBoot timers can run. A static import of
 * App pulls AppNavigator (and PostHog eager init) onto the same turn and
 * can block hideAsync forever.
 */
function Root() {
  const [tree, setTree] = useState<{
    PostHogProvider: React.ComponentType<{ children: React.ReactNode }>
    App: React.ComponentType
  } | null>(null)

  useEffect(() => {
    const id = setTimeout(() => {
      const { PostHogProvider } = require('./src/components/PostHogProvider')
      const App = require('./App').default
      setTree({ PostHogProvider, App })
    }, 0)
    return () => clearTimeout(id)
  }, [])

  if (!tree) {
    return React.createElement(View, {
      style: { flex: 1, backgroundColor: '#007ACC' },
    })
  }

  return React.createElement(
    tree.PostHogProvider,
    null,
    React.createElement(tree.App),
  )
}

registerRootComponent(Root);
