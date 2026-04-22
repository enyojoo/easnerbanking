import type { ReactNode } from "react"

/**
 * Client layout matches other shell routes (e.g. `/transactions`): no async
 * server work on navigation, so moving to Home stays instant. The dashboard
 * page loads transactions via `useTransactionsCached` / React Query like
 * elsewhere; `constrained` keeps the narrower max width for this screen.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children
}
