"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SetupPayoutDialog } from "@/components/terminal/setup-payout-dialog"
import { TerminalSessionsTableSkeleton } from "@/components/terminal/terminal-sessions-table-skeleton"
import { CollectionsPageHeader } from "@/components/collections/collections-page-header"
import { getBusinessAppPublicOrigin } from "@/lib/business-app-public-url"
import { formatDate } from "@/lib/utils"
import { ExternalLink, Copy } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-context"
import {
  useTerminalSessionsCached,
  type TerminalSessionListItem,
} from "@/hooks/use-terminal-sessions-cached"
import { cn } from "@/lib/utils"
import { PAGE_COPY, TERMINAL_LIST_COPY } from "@/lib/copy/business-ui-copy"

type ChargeTab = "all" | "open" | "paid" | "failed"

function shortSessionRef(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase()
}

function chargeTab(status: string): Exclude<ChargeTab, "all"> {
  if (status === "payout_complete") return "paid"
  if (status === "failed" || status === "expired") return "failed"
  return "open"
}

function statusClassName(status: string): string {
  if (status === "failed" || status === "expired") return "text-destructive font-medium"
  if (status === "payout_complete") return "text-emerald-600 dark:text-emerald-400 font-medium"
  if (status === "creating_workflow") return "text-muted-foreground"
  return "text-foreground"
}

function emptyCopy(tab: ChargeTab, searching: boolean): string {
  if (searching) return TERMINAL_LIST_COPY.emptySearch
  if (tab === "open") return TERMINAL_LIST_COPY.emptyOpen
  if (tab === "paid") return TERMINAL_LIST_COPY.emptyPaid
  if (tab === "failed") return TERMINAL_LIST_COPY.emptyFailed
  return TERMINAL_LIST_COPY.emptySearch
}

function SessionsTable({ sessions }: { sessions: TerminalSessionListItem[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[960px] table-fixed">
        <colgroup>
          <col style={{ width: "12%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "20%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "18%" }} />
        </colgroup>
        <thead className="border-b">
          <tr>
            <th className="p-4 text-left align-middle text-xs font-medium text-muted-foreground">
              Created
            </th>
            <th className="p-4 text-left align-middle text-xs font-medium text-muted-foreground">Ref</th>
            <th className="p-4 text-left align-middle text-xs font-medium text-muted-foreground">
              Fiat
            </th>
            <th className="p-4 text-left align-middle text-xs font-medium text-muted-foreground">
              Min. crypto
            </th>
            <th className="p-4 text-left align-middle text-xs font-medium text-muted-foreground">
              Asset / network
            </th>
            <th className="p-4 text-left align-middle text-xs font-medium text-muted-foreground">
              Status
            </th>
            <th className="p-4 text-left align-middle text-xs font-medium text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sessions.map((s) => (
            <tr
              key={s.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => window.open(`/pay/charge/${s.id}`, "_blank", "noopener,noreferrer")}
            >
              <td className="min-w-0 whitespace-nowrap p-4 align-middle text-sm text-muted-foreground">
                {formatDate(s.created_at)}
              </td>
              <td className="min-w-0 p-4 align-middle">
                <span className="font-mono text-xs text-foreground">{shortSessionRef(s.id)}</span>
              </td>
              <td className="min-w-0 p-4 align-middle tabular-nums">
                <span className="text-sm font-medium">
                  {String(s.fiat_amount)} {s.fiat_currency}
                </span>
              </td>
              <td className="min-w-0 p-4 align-middle tabular-nums">
                <span className="font-mono text-xs">
                  {s.crypto_amount_expected?.trim()
                    ? `${s.crypto_amount_expected} ${s.crypto_currency}`
                    : "–"}
                </span>
              </td>
              <td className="min-w-0 p-4 align-middle">
                <span className="block truncate text-sm">{s.crypto_currency}</span>
                <span className="block truncate text-xs text-muted-foreground">{s.network}</span>
              </td>
              <td className="min-w-0 p-4 align-middle">
                <span className={cn("text-sm capitalize", statusClassName(s.status))}>
                  {s.status.replace(/_/g, " ")}
                </span>
              </td>
              <td className="min-w-0 p-4 align-middle" onClick={(e) => e.stopPropagation()}>
                <Link
                  href={`/pay/charge/${s.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View charge
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function TerminalPage() {
  const { isLoading: authLoading } = useAuth()
  const { data: sessions, loading: sessionsLoading } = useTerminalSessionsCached()
  const showTableSkeleton = (authLoading && sessions.length === 0) || (sessionsLoading && sessions.length === 0)
  const [tab, setTab] = useState<ChargeTab>("all")
  const [search, setSearch] = useState("")

  const [payUrl, setPayUrl] = useState(() => {
    const envOrigin = getBusinessAppPublicOrigin()
    return envOrigin ? `${envOrigin.replace(/\/$/, "")}/pay` : "/pay"
  })
  useEffect(() => {
    const envOrigin = getBusinessAppPublicOrigin()
    const origin = envOrigin || (typeof window !== "undefined" ? window.location.origin : "")
    if (origin) {
      setPayUrl(`${origin.replace(/\/$/, "")}/pay`)
    }
  }, [])

  const copyCounterUrl = async () => {
    try {
      await navigator.clipboard.writeText(payUrl)
      toast.success("Counter link copied")
    } catch {
      toast.error("Could not copy")
    }
  }

  const openCount = sessions.filter((s) => chargeTab(s.status) === "open").length
  const paidCount = sessions.filter((s) => chargeTab(s.status) === "paid").length
  const failedCount = sessions.filter((s) => chargeTab(s.status) === "failed").length
  const statusTabs = [
    { id: "all" as const, label: TERMINAL_LIST_COPY.tabAll, count: sessions.length },
    { id: "open" as const, label: TERMINAL_LIST_COPY.tabOpen, count: openCount },
    { id: "paid" as const, label: TERMINAL_LIST_COPY.tabPaid, count: paidCount },
    { id: "failed" as const, label: TERMINAL_LIST_COPY.tabFailed, count: failedCount },
  ]

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sessions.filter((row) => {
      if (tab !== "all" && chargeTab(row.status) !== tab) return false
      if (!q) return true
      return `${shortSessionRef(row.id)} ${row.fiat_amount} ${row.fiat_currency} ${row.crypto_currency} ${row.network} ${row.status} ${row.destination_address ?? ""}`
        .toLowerCase()
        .includes(q)
    })
  }, [sessions, tab, search])

  return (
    <div className="flex flex-col gap-6">
      <CollectionsPageHeader
        title={PAGE_COPY.terminal.title}
        intro={PAGE_COPY.terminal.intro}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" asChild>
              <Link href="/pay" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden />
                Open counter
              </Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => void copyCounterUrl()}>
              <Copy className="h-4 w-4" aria-hidden />
              Copy URL
            </Button>
            <SetupPayoutDialog />
          </div>
        }
      />

      {sessions.length > 0 ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 space-x-1 overflow-x-auto">
            {statusTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === item.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
                {item.count > 0 ? (
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">{item.count}</span>
                ) : null}
              </button>
            ))}
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={TERMINAL_LIST_COPY.search}
            className="w-full max-w-[220px] shrink-0 sm:max-w-xs"
          />
        </div>
      ) : null}

      <Card className="flex min-h-[400px] flex-col">
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          {showTableSkeleton ? (
            <TerminalSessionsTableSkeleton />
          ) : sessions.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-12">
              <div className="text-center">
                <h3 className="mb-2 text-lg font-semibold">No charges yet</h3>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Use Setup payout to add a method and set the default, then open the counter or copy its URL.
                </p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              {emptyCopy(tab, Boolean(search.trim()))}
            </p>
          ) : (
            <SessionsTable sessions={filtered} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
