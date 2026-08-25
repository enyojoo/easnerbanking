"use client"

import type { MouseEvent, ReactNode } from "react"
import Link from "next/link"
import type { Scope } from "@easner/shared"
import { getTransactionDetailPrefetchOptions } from "@/hooks/queries/use-transactions"
import { useHoverPrefetch } from "@/lib/query/use-hover-prefetch"
import { useScope } from "@/lib/query/scope"
import { parseTransactionDetailPathname } from "@/components/transactions/transaction-detail-view"

/**
 * In-app transaction-detail navigation is a shallow `history.pushState`:
 * `/transactions/[etid]` is the app's one dynamic route, so a real Next
 * navigation costs a full server RSC round trip per click (measured ~1s+
 * before any data). With pushState, `usePathname()` updates, the
 * DashboardShell overlay renders TransactionDetailView from the (hover-
 * prefetched) React Query cache, and the click is a same-frame swap. The
 * <a> href stays real, so middle-click, cmd-click, copy-link, and deep
 * links all still hit the actual route.
 */
function shouldClientNavigate(event: MouseEvent<HTMLAnchorElement>): boolean {
  if (event.defaultPrevented) return false
  if (event.button !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  return true
}

function DetailLink({
  href,
  className,
  children,
  onHoverBind,
}: {
  href: string
  className?: string
  children: ReactNode
  onHoverBind?: Record<string, unknown>
}) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!shouldClientNavigate(event)) return
    const pathnameOnly = href.split("?")[0]
    if (!parseTransactionDetailPathname(pathnameOnly)) return
    event.preventDefault()
    window.history.pushState(null, "", href)
  }
  return (
    <Link href={href} className={className} onClick={handleClick} {...(onHoverBind ?? {})}>
      {children}
    </Link>
  )
}

function PrefetchInner({
  scope,
  txId,
  href,
  className,
  children,
}: {
  scope: Scope
  txId: string
  href: string
  className?: string
  children: ReactNode
}) {
  const bind = useHoverPrefetch(getTransactionDetailPrefetchOptions(scope, txId))
  return (
    <DetailLink href={href} className={className} onHoverBind={bind}>
      {children}
    </DetailLink>
  )
}

/**
 * Link to `/transactions/[etid]` with row-hover prefetch into the same React Query
 * cache as `useTransactionDetail` (matches dashboard / list UX).
 */
export function TransactionDetailPrefetchLink({
  txId,
  href,
  className,
  children,
}: {
  txId: string
  href: string
  className?: string
  children: ReactNode
}) {
  const { scope } = useScope()
  if (!scope) {
    return (
      <DetailLink href={href} className={className}>
        {children}
      </DetailLink>
    )
  }
  return (
    <PrefetchInner scope={scope} txId={txId} href={href} className={className}>
      {children}
    </PrefetchInner>
  )
}
