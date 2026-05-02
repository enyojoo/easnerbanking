"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import type { Scope } from "@easner/shared"
import { getTransactionDetailPrefetchOptions } from "@/hooks/queries/use-transactions"
import { useHoverPrefetch } from "@/lib/query/use-hover-prefetch"
import { useScope } from "@/lib/query/scope"

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
    <Link href={href} className={className} {...bind}>
      {children}
    </Link>
  )
}

/**
 * Next.js link to `/transactions/[etid]` with row-hover prefetch into the same React Query
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
      <Link href={href} className={className}>
        {children}
      </Link>
    )
  }
  return (
    <PrefetchInner scope={scope} txId={txId} href={href} className={className}>
      {children}
    </PrefetchInner>
  )
}
