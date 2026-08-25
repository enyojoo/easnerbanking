"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useOfficeTerminalSessions, useQueryInitialLoading } from "@/hooks/queries"
import { OfficeQueryError } from "@/components/data/office-data-status"

type Row = {
  id: string
  business_id: string
  status: string
  fiat_amount: number | string | null
  fiat_currency: string | null
  crypto_currency: string | null
  network: string | null
  crypto_amount_expected: string | null
  created_at: string
  expires_at: string | null
  settlement_destination: string | null
  balance_currency: string | null
  recipient_id: string | null
}

function fmtFiat(amount: number | string | null, currency: string | null) {
  const n = typeof amount === "string" ? Number.parseFloat(amount) : amount
  if (amount == null || !Number.isFinite(n)) return "–"
  const c = (currency || "USD").toUpperCase()
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`
}

export default function TerminalPage() {
  const terminalQuery = useOfficeTerminalSessions()
  const rows = (terminalQuery.data ?? []) as Row[]

  const message =
    terminalQuery.error instanceof Error
      ? terminalQuery.error.message
      : terminalQuery.error
        ? String(terminalQuery.error)
        : null
  const loading = useQueryInitialLoading(terminalQuery.isPending, terminalQuery.data, rows)

  return (
    <>
      <div className="p-6 space-y-4">
        <div className="flex min-h-8 items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">Terminal</h1>
        </div>
        <OfficeQueryError
          message={message}
          hasData={rows.length > 0}
          onRetry={() => void terminalQuery.refetch()}
        />
        <Card>
          <CardHeader>
            <CardTitle>All terminal sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fiat</TableHead>
                    <TableHead>Crypto</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Settlement</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Business</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-sm text-muted-foreground">
                        No terminal sessions yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{fmtFiat(s.fiat_amount, s.fiat_currency)}</TableCell>
                        <TableCell className="text-sm">
                          {s.crypto_currency && s.network ? `${s.crypto_currency} · ${s.network}` : "–"}
                          {s.crypto_amount_expected ? (
                            <span className="block text-muted-foreground text-xs">Exp. {s.crypto_amount_expected}</span>
                          ) : null}
                        </TableCell>
                        <TableCell>{s.status}</TableCell>
                        <TableCell className="text-sm">
                          {s.settlement_destination ?? "–"}
                          {s.balance_currency ? (
                            <span className="block text-muted-foreground text-xs">{s.balance_currency}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{s.created_at}</TableCell>
                        <TableCell className="font-mono text-xs">{s.business_id}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
