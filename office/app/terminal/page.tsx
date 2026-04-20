"use client"

import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { officeFetch } from "@/lib/api-client"
import { useQuery } from "@tanstack/react-query"
import { officeKeys } from "@/lib/query/keys"

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
  if (amount == null || !Number.isFinite(n)) return "—"
  const c = (currency || "USD").toUpperCase()
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`
}

export default function TerminalPage() {
  const { data: rows = [], error } = useQuery({
    queryKey: officeKeys.terminalSessions(),
    queryFn: async () => {
      const r = await officeFetch("/api/admin/business/terminal-sessions")
      const d = (await r.json()) as { sessions?: Row[]; error?: string }
      if (d.error) throw new Error(d.error)
      return d.sessions ?? []
    },
    staleTime: 60_000,
  })

  const message = error instanceof Error ? error.message : error ? String(error) : null

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Terminal</h1>
        {message && <p className="text-sm text-destructive">{message}</p>}
        <Card>
          <CardHeader>
            <CardTitle>All terminal sessions</CardTitle>
          </CardHeader>
          <CardContent>
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
                        {s.crypto_currency && s.network ? `${s.crypto_currency} · ${s.network}` : "—"}
                        {s.crypto_amount_expected ? (
                          <span className="block text-muted-foreground text-xs">Exp. {s.crypto_amount_expected}</span>
                        ) : null}
                      </TableCell>
                      <TableCell>{s.status}</TableCell>
                      <TableCell className="text-sm">
                        {s.settlement_destination ?? "—"}
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
          </CardContent>
        </Card>
      </div>
    </OfficeDashboardLayout>
  )
}
