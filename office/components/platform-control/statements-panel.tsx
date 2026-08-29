"use client"

import { useMemo, useState } from "react"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { formatOfficeTimestamp } from "@/lib/format-office-date"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Download, Loader2, Search, X } from "lucide-react"
import { useOfficeStatementsList, useQueryInitialLoading } from "@/hooks/queries"
import { downloadOfficeStatement } from "@/hooks/queries/use-office-statements"
import { OfficeQueryError } from "@/components/data/office-data-status"

export function StatementsPanel() {
  const [searchTerm, setSearchTerm] = useState("")
  const [currency, setCurrency] = useState("all")
  const [scope, setScope] = useState("all")
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const query = useOfficeStatementsList()
  const loading = useQueryInitialLoading(query.isPending, query.data)
  const statements = useMemo(
    () => query.data?.pages.flatMap((page) => page.statements) ?? [],
    [query.data],
  )

  const deferredSearchTerm = useDebouncedValue(searchTerm, 250)
  const filteredStatements = useMemo(() => {
    const needle = deferredSearchTerm.toLowerCase().trim()
    return statements.filter((row) => {
      const matchesSearch =
        !needle ||
        row.statement_id.toLowerCase().includes(needle) ||
        row.holder_name.toLowerCase().includes(needle) ||
        row.holder_email.toLowerCase().includes(needle)

      const matchesCurrency = currency === "all" || row.currency === currency
      const matchesScope = scope === "all" || row.scope === scope

      return matchesSearch && matchesCurrency && matchesScope
    })
  }, [statements, deferredSearchTerm, currency, scope])

  const onDownload = async (statementId: string) => {
    const row = statements.find((s) => s.statement_id === statementId)
    if (!row) return
    setDownloadError(null)
    setDownloadingId(statementId)
    try {
      await downloadOfficeStatement(row)
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "Download failed")
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Statements</h2>
        <p className="text-sm text-muted-foreground">
          Account statements generated from Easner Personal and Easner Business.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search name, email, or statement ID"
            className="pl-9 bg-white"
          />
          {searchTerm ? (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger className="w-[160px] bg-white">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="personal">Personal</SelectItem>
            <SelectItem value="business">Business</SelectItem>
          </SelectContent>
        </Select>
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger className="w-[140px] bg-white">
            <SelectValue placeholder="Currency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All currencies</SelectItem>
            <SelectItem value="USD">USD</SelectItem>
            <SelectItem value="EUR">EUR</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {downloadError ? <p className="text-sm text-destructive">{downloadError}</p> : null}
      <OfficeQueryError
        message={query.error instanceof Error ? query.error.message : query.error ? "Failed to load statements" : null}
        onRetry={() => void query.refetch()}
      />

      <Card>
        <CardContent className="p-0">
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[17%]">Statement ID</TableHead>
                <TableHead className="w-[22%]">Generated</TableHead>
                <TableHead className="w-[27%]">Who</TableHead>
                <TableHead className="w-[12%]">Type</TableHead>
                <TableHead className="w-[12%]">Currency</TableHead>
                <TableHead className="w-[10%] text-right">
                  <span className="sr-only">Download</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : filteredStatements.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.statement_id}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatOfficeTimestamp(row.created_at)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{row.holder_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{row.holder_email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {row.scope === "business" ? "Business" : "Personal"}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.currency}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon-sm"
                          variant="outline"
                          disabled={downloadingId === row.statement_id}
                          onClick={() => void onDownload(row.statement_id)}
                          aria-label={`Download statement ${row.statement_id}`}
                        >
                          {downloadingId === row.statement_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
          {!loading && statements.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No statements generated yet.</p>
          ) : null}
          {!loading && statements.length > 0 && filteredStatements.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No statements found matching your criteria.</p>
          ) : null}
        </CardContent>
      </Card>

      {query.hasNextPage ? (
        <Button variant="outline" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
          {query.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  )
}
