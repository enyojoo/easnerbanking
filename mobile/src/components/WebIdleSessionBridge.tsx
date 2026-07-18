import { useEffect } from 'react'
import { Platform } from 'react-native'
import { useAuth } from '../contexts/AuthContext'
import { emitAppLocked } from '../lib/app-lock-bus'
import { evaluateIdleLock, markSessionInteraction, updateSessionActivity } from '../lib/pinAuth'

const IDLE_CHECK_INTERVAL_MS = 60_000

/**
 * Web idle soft-lock parity with business `IdleSessionBridge`:
 * pointer/keyboard activity + visibility-based checks (not AppState tab flips).
 */
export function WebIdleSessionBridge() {
  const { user, signOut } = useAuth()

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !user?.id) return
    const uid = user.id

    const enforce = async () => {
      try {
        const result = await evaluateIdleLock(uid)
        if (result === 'signed_out') {
          await signOut()
          return
        }
        if (result === 'locked') {
          emitAppLocked('locked')
        }
      } catch (e) {
        console.warn('WebIdleSessionBridge enforce failed:', e)
      }
    }

    void enforce()

    const intervalId = window.setInterval(() => {
      void enforce()
    }, IDLE_CHECK_INTERVAL_MS)

    const touchActivity = () => {
      markSessionInteraction()
      void updateSessionActivity()
    }
    const opts: AddEventListenerOptions = { passive: true }
    window.addEventListener('mousedown', touchActivity, opts)
    window.addEventListener('keydown', touchActivity, opts)
    window.addEventListener('scroll', touchActivity, opts)
    window.addEventListener('touchstart', touchActivity, opts)
    window.addEventListener('pointerdown', touchActivity, opts)
    window.addEventListener('focusin', touchActivity, opts)

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void enforce()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('mousedown', touchActivity, opts)
      window.removeEventListener('keydown', touchActivity, opts)
      window.removeEventListener('scroll', touchActivity, opts)
      window.removeEventListener('touchstart', touchActivity, opts)
      window.removeEventListener('pointerdown', touchActivity, opts)
      window.removeEventListener('focusin', touchActivity, opts)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
    }
  }, [user?.id, signOut])

  return null
}
