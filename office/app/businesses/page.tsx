"use client"

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Eye, Building2, Search } from "lucide-react"
import { officeFetch } from "@/lib/api-client"
import { officeKeys } from "@/lib/query/keys"
import { businessTypeDisplayText } from "@/lib/business-type-label"

/** Mirrors `public.businesses` (+ owner fields from admin API). */
type BusinessRow = {
  id: string
  name: string | null
  easetag?: string | null
  slug?: string | null
  logo_url: string | null
  business_type: string | null
  base_currency: string | null
  description: string | null
  country?: string | null
  registration_number?: string | null
  tax_id?: string | null
  website?: string | null
  support_email?: string | null
  support_phone?: string | null
  address_line1?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  enabled_extra_account_currencies?: string[]
  noah_customer_id?: string | null
  noah_kyb_status?: string | null
  noah_usd_virtual_account_id?: string | null
  noah_eur_virtual_account_id?: string | null
  noah_gbp_virtual_account_id?: string | null
  created_at: string
  updated_at?: string | null
  owner_user_id?: string | null
  owner_email?: string | null
  owner_name?: string | null
}

function displayText(v: string | null | undefined): string {
  const t = v?.trim()
  return t ? t : "—"
}

function displayCurrencies(arr: string[] | null | undefined): string {
  if (!arr || arr.length === 0) return "—"
  return arr.join(", ")
}

function DetailRow({
  label,
  children,
  mono,
}: {
  label: string
  children: ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="shrink-0 text-gray-600">{label}</span>
      <div className={`min-w-0 break-all text-right ${mono ? "font-mono text-xs" : ""}`}>{children}</div>
    </div>
  )
}

function formatTimestamp(dateString: string) {
  const date = new Date(dateString)
  const month = date.toLocaleString("en-US", { month: "short" })
  const day = date.getDate().toString().padStart(2, "0")
  const year = date.getFullYear()
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, "0")
  const ampm = hours >= 12 ? "PM" : "AM"
  const displayHours = hours % 12 || 12
  return `${month} ${day}, ${year} • ${displayHours}:${minutes} ${ampm}`
}

function KybBadge({ rawStatus }: { rawStatus: string }) {
  const raw = rawStatus || "not_started"
  const key =
    raw === "approved"
      ? "verified"
      : raw === "rejected"
        ? "rejected"
        : raw === "under_review" || raw === "in_review"
          ? "in_review"
          : "pending"
  const statusConfig: Record<string, { variant: "emerald" | "amber" | "oxblood" | "slate"; text: string }> = {
    verified: { variant: "emerald", text: "Verified" },
    pending: { variant: "amber", text: "Pending" },
    rejected: { variant: "oxblood", text: "Rejected" },
    in_review: { variant: "slate", text: "In Review" },
  }
  const config = statusConfig[key] || statusConfig.pending
  return <Badge variant={config.variant}>{config.text}</Badge>
}

function BusinessesPageInner() {
  const searchParams = useSearchParams()
  const highlightBusinessId = searchParams.get("highlight")

  const [searchTerm, setSearchTerm] = useState("")
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessRow | null>(null)

  const {
    data: rows = [],
    isPending,
    error: queryError,
  } = useQuery({
    queryKey: officeKeys.businesses(),
    queryFn: async () => {
      const r = await officeFetch("/api/admin/business/businesses")
      const d = (await r.json()) as { businesses?: BusinessRow[]; error?: string }
      if (d.error) throw new Error(d.error)
      return d.businesses ?? []
    },
    staleTime: 60_000,
  })

  const error =
    queryError instanceof Error ? queryError.message : queryError ? String(queryError) : null
  const loading = isPending && rows.length === 0

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

  const ownerLabel = (o: BusinessRow) => {
    if (o.owner_name?.trim()) return o.owner_name.trim()
    if (o.owner_email?.trim()) return o.owner_email.trim()
    return o.owner_user_id ? o.owner_user_id.slice(0, 8) + "…" : "—"
  }

  const stats = {
    total: rows.length,
    withOwner: rows.filter((o) => Boolean(o.owner_user_id)).length,
  }

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Business directory</h1>
            <p className="text-gray-600">Organizations linked to Easner Business</p>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-destructive rounded-xl border border-[hsl(var(--destructive)/0.25)] bg-[hsl(var(--destructive)/0.08)] px-4 py-3">
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total businesses</CardTitle>
              <Building2 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{loading ? "—" : stats.total}</div>
              <p className="text-xs text-muted-foreground">Registered workspaces</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">With owner</CardTitle>
              <Building2 className="h-4 w-4 text-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{loading ? "—" : stats.withOwner}</div>
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
                    <TableHead className="w-[120px] text-center">KYB status</TableHead>
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
                        className={highlightBusinessId === o.id ? "bg-muted/50" : undefined}
                      >
                        <TableCell className="font-medium">{o.name || "—"}</TableCell>
                        <TableCell>
                          {o.owner_user_id ? (
                            <Link
                              href={`/users?highlight=${encodeURIComponent(o.owner_user_id)}`}
                              className="text-primary underline-offset-2 hover:underline text-sm"
                            >
                              {ownerLabel(o)}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {o.logo_url ? (
                            <img src={o.logo_url} alt="" className="h-8 w-8 rounded object-cover border" />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {(() => {
                            const t = o.easetag ?? o.slug
                            return t ? `@${t}` : "—"
                          })()}
                        </TableCell>
                        <TableCell className="max-w-[220px] text-sm">{businessTypeDisplayText(o.business_type)}</TableCell>
                        <TableCell className="text-center">
                          <KybBadge rawStatus={o.noah_kyb_status || "not_started"} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Button variant="outline" size="sm" onClick={() => setSelectedBusiness(o)}>
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

      <Dialog open={!!selectedBusiness} onOpenChange={(open) => !open && setSelectedBusiness(null)}>
        <DialogContent className="flex max-h-[min(88vh,920px)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          {selectedBusiness && (
            <>
              <DialogHeader className="shrink-0 space-y-0 border-b px-6 py-4 pr-12 text-left">
                <DialogTitle>Business — {selectedBusiness.name || "—"}</DialogTitle>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex items-start gap-3 text-sm">
                        {selectedBusiness.logo_url ? (
                          <img
                            src={selectedBusiness.logo_url}
                            alt=""
                            className="h-12 w-12 shrink-0 rounded object-cover border"
                          />
                        ) : (
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded border bg-muted text-xs text-muted-foreground">
                            No logo
                          </span>
                        )}
                        <div className="min-w-0 flex-1 space-y-2">
                          <DetailRow label="Name">{displayText(selectedBusiness.name)}</DetailRow>
                          <DetailRow label="Easetag">
                            {(() => {
                              const t = selectedBusiness.easetag ?? selectedBusiness.slug
                              return t ? `@${t}` : "—"
                            })()}
                          </DetailRow>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <DetailRow label="Created">{formatTimestamp(selectedBusiness.created_at)}</DetailRow>
                      <DetailRow label="Owner user">
                        {selectedBusiness.owner_user_id ? (
                          <Link
                            href={`/users?highlight=${encodeURIComponent(selectedBusiness.owner_user_id)}`}
                            className="text-primary underline-offset-2 hover:underline"
                          >
                            {ownerLabel(selectedBusiness)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </DetailRow>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-900">Business</label>
                    <div className="mt-2 space-y-2">
                      <DetailRow label="Business type">{businessTypeDisplayText(selectedBusiness.business_type)}</DetailRow>
                      <DetailRow label="Base currency">
                        {selectedBusiness.base_currency?.trim() || "USD"}
                      </DetailRow>
                    </div>
                    <p className="mt-3 text-sm font-medium text-gray-900">Description</p>
                    <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap rounded-md border bg-muted/30 p-3">
                      {selectedBusiness.description?.trim() ? selectedBusiness.description : "—"}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-900">Address</label>
                    <div className="mt-2 space-y-2">
                      <DetailRow label="Address line 1">{displayText(selectedBusiness.address_line1)}</DetailRow>
                      <DetailRow label="City">{displayText(selectedBusiness.city)}</DetailRow>
                      <DetailRow label="State / region">{displayText(selectedBusiness.state)}</DetailRow>
                      <DetailRow label="Postal code">{displayText(selectedBusiness.postal_code)}</DetailRow>
                      <DetailRow label="Country">{displayText(selectedBusiness.country)}</DetailRow>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-900">Registration &amp; tax</label>
                    <div className="mt-2 space-y-2">
                      <DetailRow label="Registration number" mono>
                        {displayText(selectedBusiness.registration_number)}
                      </DetailRow>
                      <DetailRow label="Tax ID" mono>
                        {displayText(selectedBusiness.tax_id)}
                      </DetailRow>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-900">Contact</label>
                    <div className="mt-2 space-y-2">
                      <DetailRow label="Website">
                        {selectedBusiness.website?.trim() ? (
                          <a
                            href={selectedBusiness.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline-offset-2 hover:underline"
                          >
                            {selectedBusiness.website}
                          </a>
                        ) : (
                          "—"
                        )}
                      </DetailRow>
                      <DetailRow label="Support email">{displayText(selectedBusiness.support_email)}</DetailRow>
                      <DetailRow label="Support phone">{displayText(selectedBusiness.support_phone)}</DetailRow>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-900">Provider references</label>
                    <div className="mt-2 space-y-2">
                      <div className="flex justify-between gap-4 text-sm">
                        <span className="shrink-0 text-gray-600">KYB status</span>
                        <KybBadge rawStatus={selectedBusiness.noah_kyb_status || "not_started"} />
                      </div>
                      <DetailRow label="Noah customer ID" mono>
                        {displayText(selectedBusiness.noah_customer_id)}
                      </DetailRow>
                      <DetailRow label="USD virtual account" mono>
                        {displayText(selectedBusiness.noah_usd_virtual_account_id)}
                      </DetailRow>
                      <DetailRow label="EUR virtual account" mono>
                        {displayText(selectedBusiness.noah_eur_virtual_account_id)}
                      </DetailRow>
                      <DetailRow label="GBP virtual account" mono>
                        {displayText(selectedBusiness.noah_gbp_virtual_account_id)}
                      </DetailRow>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-900">Extra account currencies</label>
                    <p className="mt-2 text-right text-sm font-mono text-xs break-all text-gray-900">
                      {displayCurrencies(selectedBusiness.enabled_extra_account_currencies)}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </OfficeDashboardLayout>
  )
}

export default function BusinessesPage() {
  return (
    <Suspense fallback={null}>
      <BusinessesPageInner />
    </Suspense>
  )
}
