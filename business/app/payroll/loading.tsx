"use client"

import { usePathname } from "next/navigation"
import {
  PayrollDetailSkeleton,
  PayrollWorkspaceContentSkeleton,
} from "@/components/payroll/payroll-page-skeleton"
import { payrollWorkspaceTabForPath } from "@/components/payroll/payroll-workspace-config"

export default function PayrollLoading() {
  const pathname = usePathname()
  return payrollWorkspaceTabForPath(pathname)
    ? <PayrollWorkspaceContentSkeleton />
    : <PayrollDetailSkeleton />
}
