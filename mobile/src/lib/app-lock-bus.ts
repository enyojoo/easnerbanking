type Listener = () => void

const listeners = new Set<Listener>()

export function registerAppLockListener(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function emitAppLocked(): void {
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      // ignore
    }
  }
}
