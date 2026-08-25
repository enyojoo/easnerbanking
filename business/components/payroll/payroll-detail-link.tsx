"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { prefetchDynamicRouteFull } from "@/lib/query/prefetch-dynamic-route"
import { useScope } from "@/lib/query/scope"
import type { PayrollPerson, PayrollRun } from "@/lib/payroll/types"

export function PayrollDetailLink({
  kind,
  id,
  href,
  className,
  children,
}: {
  kind: "person" | "run"
  id: string
  href: string
  className?: string
  children: React.ReactNode
}) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { scope } = useScope()

  const prefetch = () => {
    // Dynamic route: a FULL router prefetch caches the RSC payload so the
    // click doesn't pay a server round trip (auto-kind cached nothing here).
    prefetchDynamicRouteFull(router, href)
    if (!scope) return
    if (kind === "person") {
      void queryClient.prefetchQuery({
        queryKey: qk.payroll.people.detail(scope, id),
        queryFn: () =>
          apiFetch<{ person: PayrollPerson; paymentHistory?: unknown[] }>(
            `/api/business/payroll/people/${id}`,
          ),
        staleTime: 5 * 60_000,
      })
      return
    }
    void queryClient.prefetchQuery({
      queryKey: qk.payroll.runs.detail(scope, id),
      queryFn: () => apiFetch<{ run: PayrollRun }>(`/api/business/payroll/runs/${id}`),
      staleTime: 60_000,
    })
  }

  return (
    <Link
      href={href}
      className={className}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
    >
      {children}
    </Link>
  )
}
