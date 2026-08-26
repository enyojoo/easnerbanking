/** Decouple idle lock from React tree: auth calls emitAppLocked; AppLockProvider listens. */

type Listener = () => void

const listeners = new Set<Listener>()

export function registerAppLockListener(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notifyAppLockListeners(): void {
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      // ignore
    }
  }
}

export function emitAppLocked(): void {
  notifyAppLockListeners()
}

export function emitAppUnlocked(): void {
  notifyAppLockListeners()
}
