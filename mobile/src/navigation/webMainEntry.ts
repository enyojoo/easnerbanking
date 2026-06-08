import { Platform } from 'react-native'
import { getRootNavigationRef, navigateFromRoot } from './rootNavigationRef'

const DASHBOARD_PATH = '/user/dashboard'

/** After PIN unlock, land on dashboard and sync the browser URL (linking must not map `/` → Auth). */
export function enterMainAppOnWeb(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return

  const run = (): boolean => {
    const ref = getRootNavigationRef()
    if (!ref?.isReady()) return false

    const path = window.location.pathname.replace(/\/$/, '') || '/'
    if (path === '/' || path === '') {
      navigateFromRoot('MainTabs', { screen: 'Dashboard' })
      window.history.replaceState(null, '', DASHBOARD_PATH)
    }
    return true
  }

  if (run()) return
  setTimeout(() => {
    run()
  }, 0)
}
