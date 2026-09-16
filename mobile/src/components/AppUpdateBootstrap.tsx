import React, { useCallback, useEffect, useState } from 'react'
import { AppState, Platform } from 'react-native'
import {
  checkAndFetchAppUpdate,
  isAppUpdatesEnabled,
  isSensitiveAppUpdateRoute,
  reloadAppWithUpdate,
} from '../lib/appUpdates'
import { AppUpdateReadyBar } from './AppUpdateReadyBar'

type AppUpdateBootstrapProps = {
  routeName: string
}

/**
 * Downloads EAS Updates on launch and foreground. Never reloads during PIN,
 * send confirmation, MFA, or checkout. A restart bar appears on safe screens.
 */
export function AppUpdateBootstrap({ routeName }: AppUpdateBootstrapProps) {
  const [updateReady, setUpdateReady] = useState(false)

  const check = useCallback(() => {
    if (!isAppUpdatesEnabled()) return
    void checkAndFetchAppUpdate().then((ready) => {
      if (ready) setUpdateReady(true)
    })
  }, [])

  useEffect(() => {
    if (Platform.OS === 'web') return
    check()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check()
    })
    return () => sub.remove()
  }, [check])

  if (Platform.OS === 'web') return null
  if (!updateReady) return null
  if (isSensitiveAppUpdateRoute(routeName)) return null

  return <AppUpdateReadyBar onRestart={() => void reloadAppWithUpdate()} />
}
