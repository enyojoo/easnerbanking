"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { formatOfficeDate as formatDate } from "@/lib/format-office-date"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, Download, Filter, Eye, User, UserCheck } from "lucide-react"
import {
  useOfficeAdminEnabled,
  useOfficeUsersDirectory,
  useQueryInitialLoading,
  type OfficeUserRow,
} from "@/hooks/queries"
import { VERIFICATION_STATUS_COPY, verificationStatusLabel, WALLET_SEND_COMPLIANCE_STATUS_LABEL } from "@easner/shared"
import { OfficeQueryError } from "@/components/data/office-data-status"
import { OfficePageSkeleton } from "@/components/data/office-page-skeleton"
import { prefetchOfficeUserCase } from "@/components/case/user-case"
import { isOrgLinkedUser } from "@/lib/case/status"

type UserData = OfficeUserRow

function userDisplayName(user: Pick<UserData, "id" | "email" | "full_name">) {
  const n = (user.full_name || "").trim()
  if (n) return n
  if (user.email) return user.email
  return `${user.id.slice(0, 8)}…`
}

function resolveOverviewVerificationStatus(user: UserData): string {
  const role = String(user.role || "").toLowerCase()
  const isBizContext = role === "business" || Boolean(user.easner_business_id)
  if (isBizContext && user.verification_status) {
    return String(user.verification_status)
  }
  const bridge = String(user.bridge_kyc_status || "").trim()
  if (bridge) return bridge
  if (String(user.verification_provider || "").toLowerCase() === "bridge") {
    return String(user.verification_status || "not_started")
  }
  return String(user.noah_kyc_status || user.noahKycStatus || "not_started")
}

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

function UserOverviewStatusBadge({ user }: { user: UserData }) {
  if (user.accountRestrictionPhase === "wind_down") return <Badge variant="oxblood">Restricted</Badge>
  if (user.accountRestrictionPhase === "locked") return <Badge variant="oxblood">Closed</Badge>
  const raw = resolveOverviewVerificationStatus(user)
  return <Badge variant={verificationBadgeVariant(raw)}>{verificationStatusLabel(raw)}</Badge>
}

const USERS_RENDER_PAGE_SIZE = 100

function AdminUsersPageInner() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const highlightUserId = searchParams.get("highlight")
  const { authLoading } = useOfficeAdminEnabled()
  const [searchTerm, setSearchTerm] = useState("")
  const [visibleCount, setVisibleCount] = useState(USERS_RENDER_PAGE_SIZE)
  const [roleFilter, setRoleFilter] = useState<"all" | "individual" | "business">("all")
  const [verificationFilter, setVerificationFilter] = useState("all")

  const directoryQuery = useOfficeUsersDirectory()
  const directoryUsers = directoryQuery.data ?? []
  const dirLoading = useQueryInitialLoading(directoryQuery.isPending, directoryQuery.data, directoryUsers)
  const dirError =
    directoryQuery.error instanceof Error
      ? directoryQuery.error.message
      : directoryQuery.error
        ? String(directoryQuery.error)
        : null

  const deferredSearchTerm = useDebouncedValue(searchTerm, 250)
  const filteredUsers = useMemo(() => {
    const q = deferredSearchTerm.toLowerCase()
    return directoryUsers.filter((user: UserData) => {
      const name = (user.full_name || "").toLowerCase()
      const em = (user.email || "").toLowerCase()
      const matchesSearch = !q || name.includes(q) || em.includes(q) || user.id.toLowerCase().includes(q)
      const role = String(user.role || "individual").toLowerCase()
      const matchesRole = roleFilter === "all" || role === roleFilter
      const overviewStatus = resolveOverviewVerificationStatus(user)
      let matchesVerification = true
      if (verificationFilter !== "all") {
        if (verificationFilter === "verified") {
          matchesVerification = overviewStatus === "approved"
        } else if (verificationFilter === "pending") {
          matchesVerification = overviewStatus !== "approved" && overviewStatus !== "rejected"
        } else if (verificationFilter === "rejected") {
          matchesVerification = overviewStatus === "rejected"
        } else if (verificationFilter === "in_review") {
          matchesVerification = overviewStatus === "under_review" || overviewStatus === "in_review"
        } else if (verificationFilter === "unverified") {
          matchesVerification = !overviewStatus || overviewStatus === "not_started"
        }
      }
      return matchesSearch && matchesRole && matchesVerification
    })
  }, [directoryUsers, deferredSearchTerm, roleFilter, verificationFilter])

  useEffect(() => {
    setVisibleCount(USERS_RENDER_PAGE_SIZE)
  }, [deferredSearchTerm, roleFilter, verificationFilter])

  useEffect(() => {
    if (!highlightUserId || directoryUsers.length === 0) return
    const foundIndex = directoryUsers.findIndex((u) => u.id === highlightUserId)
    if (foundIndex < 0) return
    setVisibleCount((count) => Math.max(count, foundIndex + 1))
    requestAnimationFrame(() => {
      document.querySelector(`[data-user-row="${highlightUserId}"]`)?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      })
    })
  }, [directoryUsers, highlightUserId])

  const visibleUsers = useMemo(
    () => (filteredUsers.length > visibleCount ? filteredUsers.slice(0, visibleCount) : filteredUsers),
    [filteredUsers, visibleCount],
  )
  const hasMoreToRender = filteredUsers.length > visibleUsers.length

  function accountTypeLabel(user: UserData): "Consumer" | "Business" | null {
    const role = String(user.role || "").toLowerCase()
    const hasOrg = Boolean(user.easner_business_id)
    if (role === "business" || hasOrg) return "Business"
    if (role === "individual" || user.totalTransactions > 0) return "Consumer"
    return null
  }

  const registrationStats = useMemo(
    () => ({
      totalUsers: directoryUsers.length,
      verifiedUsers: directoryUsers.filter((u) => resolveOverviewVerificationStatus(u) === "approved").length,
      newThisWeek: directoryUsers.filter(
        (u) => new Date(u.created_at).getTime() > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).getTime(),
      ).length,
    }),
    [directoryUsers],
  )

  const handleExport = () => {
    const csvContent = [
      [
        "Full name",
        "Email",
        "Phone",
        "Role",
        "Business id",
        "Email confirmed",
        "Identity verification (KYC)",
        "Business verification (KYB)",
        "Bridge KYC/KYB",
        "Created",
      ].join(","),
      ...filteredUsers.map((u: UserData) =>
        [
          `"${(u.full_name || "").replace(/"/g, '""')}"`,
          u.email || "",
          u.phone || "",
          u.role || "individual",
          u.easner_business_id || "",
          u.email_confirmed_at ? "yes" : "no",
          u.noah_kyc_status || "",
          u.verification_status || "",
          u.bridge_kyc_status || "",
          formatDate(u.created_at),
        ].join(","),
      ),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "users.csv"
    a.click()
    window.URL.revokeObjectURL(url)
  }

  if (authLoading || (dirLoading && directoryUsers.length === 0 && !dirError)) {
    return <OfficePageSkeleton cards={2} />
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <Button onClick={handleExport} variant="outline" title="Exports the currently loaded rows after active filters">
          <Download className="h-4 w-4 mr-2" />
          Export loaded
        </Button>
      </div>

      <OfficeQueryError message={dirError} hasData={directoryUsers.length > 0} onRetry={() => void directoryQuery.refetch()} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total users</CardTitle>
            <User className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{registrationStats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">New profiles in the last 7 days: {registrationStats.newThisWeek}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Verified</CardTitle>
            <UserCheck className="h-4 w-4 text-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{registrationStats.verifiedUsers}</div>
            <p className="text-xs text-muted-foreground">Users who completed identity verification</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as "all" | "individual" | "business")}>
              <SelectTrigger>
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="business">Business</SelectItem>
              </SelectContent>
            </Select>
            <Select value={verificationFilter} onValueChange={setVerificationFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Verification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Verification</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="unverified">Unverified</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-left min-w-[160px]">Name</TableHead>
                <TableHead className="min-w-[180px]">Email</TableHead>
                <TableHead className="w-[130px] text-center">Account type</TableHead>
                <TableHead className="w-[160px] text-center">Verification</TableHead>
                <TableHead className="w-[100px] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleUsers.map((user: UserData) => {
                const type = accountTypeLabel(user)
                return (
                  <TableRow
                    key={user.id}
                    data-user-row={user.id}
                    className={`cursor-pointer hover:bg-muted/40 ${highlightUserId === user.id ? "bg-muted/50" : ""}`}
                    onPointerEnter={() => prefetchOfficeUserCase(queryClient, user.id, isOrgLinkedUser(user))}
                    onClick={() => router.push(`/users/${user.id}`)}
                  >
                    <TableCell className="text-left font-medium">{userDisplayName(user)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate" title={user.email || ""}>
                      {user.email || "–"}
                    </TableCell>
                    <TableCell className="text-center">
                      {type ? (
                        <Badge variant={type === "Business" ? "emerald" : "slate"}>{type}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">–</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex flex-wrap items-center justify-center gap-1">
                        <UserOverviewStatusBadge user={user} />
                        {user.velocityLimitActive ? (
                          <Badge variant="amber">{WALLET_SEND_COMPLIANCE_STATUS_LABEL}</Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onPointerEnter={() => prefetchOfficeUserCase(queryClient, user.id, isOrgLinkedUser(user))}
                        onFocus={() => prefetchOfficeUserCase(queryClient, user.id, isOrgLinkedUser(user))}
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/users/${user.id}`)
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No users found matching your criteria.</div>
          ) : null}
          {hasMoreToRender ? (
            <div className="flex items-center justify-center gap-3 pt-4">
              <span className="text-sm text-muted-foreground">
                Showing {visibleUsers.length} of {filteredUsers.length}
              </span>
              <Button variant="outline" onClick={() => setVisibleCount((count) => count + USERS_RENDER_PAGE_SIZE)}>
                Load more
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<OfficePageSkeleton cards={2} />}>
      <AdminUsersPageInner />
    </Suspense>
  )
}
