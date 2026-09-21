"use client"

/**
 * Console routes inherit Test/Live from DashboardShell. This layout wrapper
 * stays so `/console` pages keep a stable tree without a second switch.
 */
export function ConsoleShell({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
