export type AppLockEvent = 'locked' | 'unlocked'

type Listener = (event: AppLockEvent) => void

const listeners = new Set<Listener>()

export function registerAppLockListener(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function emitAppLocked(event: AppLockEvent = 'locked'): void {
  for (const fn of listeners) {
    try {
      fn(event)
    } catch {
      // ignore
    }
  }
}
