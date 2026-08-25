"use client"

import { useParams } from "next/navigation"
import { TransactionDetailView } from "@/components/transactions/transaction-detail-view"

/**
 * Deep-link / hard-load entry for transaction detail. In-app navigation does
 * NOT come through this route: rows navigate with shallow pushState and the
 * DashboardShell renders TransactionDetailView client-side, so clicks never
 * pay this dynamic route's server round trip.
 */
export default function TransactionDetailByEtidPage() {
  const params = useParams()
  const raw = params.etid
  const decoded = typeof raw === "string" ? decodeURIComponent(raw.trim()) : ""
  return <TransactionDetailView rawId={decoded} />
}
