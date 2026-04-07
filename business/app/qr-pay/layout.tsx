import type { Metadata } from "next"
import type React from "react"
import { DashboardShell } from "@/components/dashboard-shell"

export const metadata: Metadata = {
  title: "QR Pay | Easner Business Banking",
}

export default function QrPayLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell mainClassName="overflow-y-auto">{children}</DashboardShell>
}
