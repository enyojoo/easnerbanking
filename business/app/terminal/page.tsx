"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SetupPayoutDialog } from "@/components/terminal/setup-payout-dialog"
import { TerminalSessionsTableSkeleton } from "@/components/terminal/terminal-sessions-table-skeleton"
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

function shortSessionRef(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase()
}

function statusClassName(status: string): string {
  if (status === "failed" || status === "expired") return "text-destructive font-medium"
  if (status === "payout_complete") return "text-emerald-600 dark:text-emerald-400 font-medium"
  if (status === "creating_workflow") return "text-muted-foreground"
  return "text-foreground"
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
                    : "—"}
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

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-0 z-20 flex shrink-0 flex-col gap-4 border-b bg-background pb-4">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Terminal</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Accept in-person stablecoin payments using a virtual terminal. Before taking payments, use Setup payout to
              add a payout method and set it as the default for this terminal.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href="/pay" target="_blank" rel="noopener noreferrer" className="gap-2">
                <ExternalLink className="h-4 w-4" aria-hidden />
                Open counter
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void copyCounterUrl()}
            >
              <Copy className="h-4 w-4" aria-hidden />
              Copy URL
            </Button>
            <SetupPayoutDialog />
          </div>
        </div>
      </div>

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
          ) : (
            <SessionsTable sessions={sessions} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
