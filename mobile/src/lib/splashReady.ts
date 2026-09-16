import { InteractionManager, Platform } from 'react-native'

/**
 * Native splash can still be covering the window after PinEntry mounts.
 * Face ID / fingerprint sheets presented in that window block splash hide
 * (especially Android). Callers must wait until splash is actually gone.
 */
let splashReady = Platform.OS === 'web'
const waiters = new Set<() => void>()

export function markSplashReady(): void {
  if (splashReady) return
  splashReady = true
  for (const notify of waiters) notify()
  waiters.clear()
}

export function waitForSplashReady(): Promise<void> {
  if (splashReady) return Promise.resolve()
  return new Promise((resolve) => {
    waiters.add(resolve)
  })
}

/** Jest only. */
export function resetSplashReadyForTests(ready = Platform.OS === 'web'): void {
  splashReady = ready
  waiters.clear()
}

/** Splash gone + first paint of the lock screen before OS biometric UI. */
export async function waitForBiometricPromptSafe(): Promise<void> {
  await waitForSplashReady()
  await new Promise<void>((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }
    InteractionManager.runAfterInteractions(done)
    setTimeout(done, 450)
  })
}
