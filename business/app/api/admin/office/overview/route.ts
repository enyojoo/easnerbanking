import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import {
  buildRecentTransactionsPreview,
  computeProviderLedgerDashboardExtras,
  processRecentActivity,
  parseOverviewWindow,
} from "@/lib/admin/office-overview-compute"
import { loadTransactionsForOverview } from "@/lib/admin/office-overview-load-transactions"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const { preset, since, until } = parseOverviewWindow(url.searchParams)
  const sinceIso = since.toISOString()
  const untilIso = until.toISOString()

  const admin = createSupabaseAdmin()

  const [txLoad, usersTotalRes, usersNewRes, orgsTotalRes, orgsNewRes, customersRes, invoicesRes, terminalSessionsRes] =
    await Promise.all([
      loadTransactionsForOverview(admin, sinceIso, untilIso, 500),
      admin.from("users").select("id", { count: "exact", head: true }),
      admin.from("users").select("id", { count: "exact", head: true }).gte("created_at", sinceIso).lte("created_at", untilIso),
      admin.from("businesses").select("id", { count: "exact", head: true }),
      admin
        .from("businesses")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sinceIso)
        .lte("created_at", untilIso),
      admin.from("business_customers").select("id", { count: "exact", head: true }),
      admin.from("invoices").select("id", { count: "exact", head: true }),
      admin.from("terminal_sessions").select("id", { count: "exact", head: true }),
    ])

  if (txLoad.error) {
    console.error("office overview transactions:", txLoad.error)
    return NextResponse.json({ error: txLoad.error.message }, { status: 500 })
  }

  const transactions = txLoad.data
  const pendingTransactions = transactions.filter(
    (t) => String(t.status || "").toLowerCase() === "pending" || String(t.status || "").toLowerCase() === "processing",
  ).length

  const { volumeBalance, totalVolumeUsd, topCurrencies, processingBuckets } =
    computeProviderLedgerDashboardExtras(transactions)
  const recentActivity = processRecentActivity(transactions, 10)
  const recentTransactions = buildRecentTransactionsPreview(transactions, 10)

  const usersListRes = await admin.from("users").select("id,email,noah_kyc_status")
  const usersList = usersListRes.data || []
  // public.users has no account `status`; approximate "reachable" users as rows with an email.
  const activeUsers = usersList.filter((u) => Boolean((u as { email?: string | null }).email)).length
  const verifiedUsers = usersList.filter((u) => u.noah_kyc_status === "approved").length

  const firstBizErr = customersRes.error || invoicesRes.error || terminalSessionsRes.error
  if (firstBizErr) {
    console.error("office overview b2b counts:", firstBizErr)
  }

  return NextResponse.json({
    window: {
      preset,
      since: sinceIso,
      until: untilIso,
    },
    kpis: {
      totalUsers: usersTotalRes.count ?? 0,
      newUsersInWindow: usersNewRes.count ?? 0,
      totalBusinesses: orgsTotalRes.count ?? 0,
      newBusinessesInWindow: orgsNewRes.count ?? 0,
      transactionCount: transactions.length,
      transactionVolumeUsd: totalVolumeUsd,
      volumeBalance,
      pendingTransactions,
      activeUsers,
      verifiedUsers,
      b2bCustomerCount: customersRes.error ? 0 : customersRes.count ?? 0,
      invoiceCount: invoicesRes.error ? 0 : invoicesRes.count ?? 0,
      terminalSessionCount: terminalSessionsRes.error ? 0 : terminalSessionsRes.count ?? 0,
    },
    topCurrencies,
    processingBuckets,
    recentActivity,
    recentTransactions,
    links: {
      platformHealth: "/platform-control?tab=webhooks",
      currencies: "/platform-control?tab=platform",
      fiatSend: "/platform-control?tab=fiat",
      cryptoSend: "/platform-control?tab=crypto",
      transactions: "/transactions",
      platformControl: "/platform-control",
    },
  })
}
