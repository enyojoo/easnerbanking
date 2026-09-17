"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Eye, Building2, Search } from "lucide-react"
import { useOfficeBusinesses, useQueryInitialLoading } from "@/hooks/queries"
import { businessTypeDisplayText } from "@/lib/business-type-label"
import { OfficeQueryError } from "@/components/data/office-data-status"
import { VERIFICATION_STATUS_COPY, verificationStatusLabel, WALLET_SEND_COMPLIANCE_STATUS_LABEL } from "@easner/shared"
import { prefetchOfficeBusinessCase } from "@/components/case/business-case"
import type { OfficeBusinessRow } from "@/lib/case/types"

function verificationBadgeVariant(rawStatus: string): "emerald" | "amber" | "oxblood" | "slate" {
  const label = verificationStatusLabel(rawStatus || null)
  if (label === VERIFICATION_STATUS_COPY.verified) return "emerald"
  if (label === VERIFICATION_STATUS_COPY.inReview) return "slate"
  if (
    label === VERIFICATION_STATUS_COPY.actionNeeded ||
    label === VERIFICATION_STATUS_COPY.rejected
  ) {
    return "oxblood"
  }
  return "amber"
}

function BusinessKybStatusBadge({
  verificationStatus,
  accountRestrictionPhase,
  velocityLimitActive,
}: {
  verificationStatus?: string | null
  accountRestrictionPhase?: "wind_down" | "locked" | null
  velocityLimitActive?: boolean
}) {
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-1">
      {accountRestrictionPhase === "wind_down" ? (
        <Badge variant="oxblood">Restricted</Badge>
      ) : accountRestrictionPhase === "locked" ? (
        <Badge variant="oxblood">Closed</Badge>
      ) : (
        <Badge variant={verificationBadgeVariant(verificationStatus || "not_started")}>
          {verificationStatusLabel(verificationStatus || "not_started")}
        </Badge>
      )}
      {velocityLimitActive ? <Badge variant="amber">{WALLET_SEND_COMPLIANCE_STATUS_LABEL}</Badge> : null}
    </span>
  )
}

function BusinessesPageInner() {
  const searchParams = useSearchParams()
  const highlightBusinessId = searchParams.get("highlight")
  const router = useRouter()
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState("")

  const businessesQuery = useOfficeBusinesses()
  const rows = (businessesQuery.data ?? []) as OfficeBusinessRow[]

  const error =
    businessesQuery.error instanceof Error
      ? businessesQuery.error.message
      : businessesQuery.error
        ? String(businessesQuery.error)
        : null
  const loading = useQueryInitialLoading(businessesQuery.isPending, businessesQuery.data, rows)

  const displayRows = useMemo(() => {
    const q = searchTerm.toLowerCase().trim()
    let list = rows
    if (q) {
      list = rows.filter((o) => {
        const name = (o.name || "").toLowerCase()
        const tag = (o.easetag || o.slug || "").toLowerCase()
        const id = o.id.toLowerCase()
        return name.includes(q) || tag.includes(q) || id.includes(q)
      })
    }
    if (!highlightBusinessId) return list
    const h = list.find((o) => o.id === highlightBusinessId)
    if (!h) return list
    return [h, ...list.filter((o) => o.id !== highlightBusinessId)]
  }, [rows, highlightBusinessId, searchTerm])

  useEffect(() => {
    if (!highlightBusinessId || rows.length === 0) return
    if (!rows.some((o) => o.id === highlightBusinessId)) return
    requestAnimationFrame(() => {
      document.querySelector(`[data-business-row="${highlightBusinessId}"]`)?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      })
    })
  }, [rows, highlightBusinessId])

  const ownerLabel = (o: OfficeBusinessRow) => {
    if (o.owner_name?.trim()) return o.owner_name.trim()
    if (o.owner_email?.trim()) return o.owner_email.trim()
    return o.owner_user_id ? o.owner_user_id.slice(0, 8) + "…" : "–"
  }

  const stats = {
    total: rows.length,
    withOwner: rows.filter((o) => Boolean(o.owner_user_id)).length,
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Businesses</h1>

      <OfficeQueryError message={error} hasData={rows.length > 0} onRetry={() => void businessesQuery.refetch()} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total businesses</CardTitle>
            <Building2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{loading ? "–" : stats.total}</div>
            <p className="text-xs text-muted-foreground">Registered workspaces</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">With owner</CardTitle>
            <Building2 className="h-4 w-4 text-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{loading ? "–" : stats.withOwner}</div>
            <p className="text-xs text-muted-foreground">Businesses with a linked owner user</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-5 w-5" />
            Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search by name, easetag, or id…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All businesses</CardTitle>
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
                  <TableHead className="min-w-[140px]">Name</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="w-[72px]">Logo</TableHead>
                  <TableHead>Easetag</TableHead>
                  <TableHead>Business type</TableHead>
                  <TableHead className="w-[168px] text-center">KYB</TableHead>
                  <TableHead className="w-[88px] text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                      No businesses yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  displayRows.map((o) => (
                    <TableRow
                      key={o.id}
                      data-business-row={o.id}
                      className={`cursor-pointer hover:bg-muted/40 ${highlightBusinessId === o.id ? "bg-muted/50" : ""}`}
                      onPointerEnter={() => prefetchOfficeBusinessCase(queryClient, o.id)}
                      onClick={() => router.push(`/businesses/${o.id}`)}
                    >
                      <TableCell className="font-medium">{o.name || "–"}</TableCell>
                      <TableCell>
                        {o.owner_user_id ? (
                          <Link
                            href={`/users/${o.owner_user_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-primary underline-offset-2 hover:underline text-sm"
                          >
                            {ownerLabel(o)}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {o.logo_url ? (
                          <img src={o.logo_url} alt="" className="h-8 w-8 rounded object-cover border" />
                        ) : (
                          "–"
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(() => {
                          const t = o.easetag ?? o.slug
                          return t ? `@${t}` : "–"
                        })()}
                      </TableCell>
                      <TableCell className="max-w-[220px] text-sm">{businessTypeDisplayText(o.business_type)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <BusinessKybStatusBadge
                            verificationStatus={o.verification_status}
                            accountRestrictionPhase={o.accountRestrictionPhase}
                            velocityLimitActive={o.velocityLimitActive}
                          />
                          {o.bridge_kyc_status ? (
                            <Badge variant={verificationBadgeVariant(o.bridge_kyc_status)}>
                              Bridge · {verificationStatusLabel(o.bridge_kyc_status)}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onPointerEnter={() => prefetchOfficeBusinessCase(queryClient, o.id)}
                          onFocus={() => prefetchOfficeBusinessCase(queryClient, o.id)}
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/businesses/${o.id}`)
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function BusinessesPage() {
  return (
    <Suspense fallback={null}>
      <BusinessesPageInner />
    </Suspense>
  )
}
