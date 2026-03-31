"use client"

import type React from "react"
import { DashboardShell } from "@/components/dashboard-shell"

/** Recipients are available before Tier 1; only money movement is tier-gated (send, deposit details, etc.). */
export default function RecipientsLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>
}

