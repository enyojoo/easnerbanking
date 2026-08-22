import type { ComponentType } from 'react'
import { reloadOnceForStaleWebBundle } from '../lib/reloadStaleWebBundle'

export function importWebScreen<P extends object>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
): Promise<{ default: ComponentType<P> }> {
  return importFn().catch((error: unknown) => {
    reloadOnceForStaleWebBundle()
    throw error
  })
}
