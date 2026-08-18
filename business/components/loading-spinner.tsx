/**
 * Business web loading surfaces.
 *
 * Contract (see packages/shared/src/query/ux-rules.ts and lib/query/loading-state.ts):
 *
 * Three content states per surface — never mix:
 *   - Cached: data exists → show immediately, silent background refetch
 *   - First-load: isQueryFirstLoad(query) → inline skeleton in that surface only
 *   - Empty: isQueryTrulyEmpty(query, isEmpty) → zero-state copy after fetch completes
 *
 * Full-screen loaders:
 *   - WorkspaceBootSplash: logo-only when workspace is reached with no session at all
 *     (definitively logged out — not during auth resolve, hydration, or soft reload)
 *   - Public pay/invoice: page-shaped skeletons, never this spinner
 *
 * Workspace rules:
 *   - Render DashboardShell immediately when session probe passes
 *   - No route loading.tsx on cached workspace routes
 *   - No dynamic() loading fallbacks on core flows
 *   - Never downgrade cached UI to skeleton
 */

import { BusinessLogo } from "@/components/brand/business-logo"

export function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
    </div>
  )
}

/** Logo-only splash for logged-out workspace redirect — not a data-loading screen. */
export function WorkspaceBootSplash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <BusinessLogo size="lg" href={undefined} priority />
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-6">
        <div className="space-y-6">
          {/* Header skeleton */}
          <div className="h-8 bg-muted rounded w-1/3 animate-pulse"></div>
          
          {/* Content skeleton */}
          <div className="space-y-4">
            <div className="h-4 bg-muted rounded w-2/3 animate-pulse"></div>
            <div className="h-4 bg-muted rounded w-1/2 animate-pulse"></div>
            <div className="h-4 bg-muted rounded w-3/4 animate-pulse"></div>
          </div>
          
          {/* Card skeleton */}
          <div className="border rounded-lg p-6 space-y-4">
            <div className="h-6 bg-muted rounded w-1/4 animate-pulse"></div>
            <div className="h-4 bg-muted rounded w-1/2 animate-pulse"></div>
            <div className="h-4 bg-muted rounded w-1/3 animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  )
}
