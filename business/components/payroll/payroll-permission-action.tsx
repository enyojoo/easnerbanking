"use client"

import type { ReactElement } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export function PayrollPermissionAction({
  allowed,
  loading,
  children,
}: {
  allowed: boolean
  loading?: boolean
  children: ReactElement
}) {
  if (allowed && !loading) return children
  const reason = loading
    ? "Checking your Payroll permissions…"
    : "Your Payroll role does not allow this action."
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed" aria-label={reason}>
            <span className="pointer-events-none opacity-50">{children}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
