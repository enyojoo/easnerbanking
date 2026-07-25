"use client"

import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
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
  const { scope } = useScope()

  const prefetch = () => {
    if (!scope) return
    if (kind === "person") {
      void queryClient.prefetchQuery({
        queryKey: qk.payroll.people.detail(scope, id),
        queryFn: () =>
          apiFetch<{ person: PayrollPerson; events?: unknown[]; paymentHistory?: unknown[] }>(
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
