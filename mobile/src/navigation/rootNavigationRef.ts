import { useEffect, useState } from 'react'
import type { NavigationContainerRef, NavigationState } from '@react-navigation/native'

export function getRootNavigationRef(): NavigationContainerRef<unknown> | null {
  return ((global as any).rootNavigationRef?.current as NavigationContainerRef<unknown> | undefined) ?? null
}

export function getRootNavigationState(): NavigationState | undefined {
  return getRootNavigationRef()?.getRootState()
}

export function navigateFromRoot(name: string, params?: Record<string, unknown>): void {
  const ref = getRootNavigationRef()
  if (!ref?.isReady()) return
  ref.navigate(name as never, params as never)
}

export function getActiveRouteNames(
  state: { routes: { name: string; state?: unknown }[]; index: number } | undefined,
): string[] {
  if (!state) return []
  const route = state.routes[state.index]
  if (!route) return []
  const names = [route.name]
  if (route.state && typeof route.state === 'object' && route.state !== null && 'routes' in route.state) {
    names.push(
      ...getActiveRouteNames(route.state as { routes: { name: string; state?: unknown }[]; index: number }),
    )
  }
  return names
}

/** Re-render when root navigation state changes (for chrome outside navigators). */
export function useRootNavigationRouteTick(): number {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const ref = getRootNavigationRef()
    if (!ref) return
    const sync = () => setTick((t) => t + 1)
    sync()
    const unsub = ref.addListener('state', sync)
    return unsub
  }, [])

  return tick
}

export function useActiveRouteNames(): string[] {
  const tick = useRootNavigationRouteTick()
  void tick
  return getActiveRouteNames(getRootNavigationState() as { routes: { name: string; state?: unknown }[]; index: number } | undefined)
}
