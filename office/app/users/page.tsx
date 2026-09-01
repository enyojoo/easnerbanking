"use client"

import { useState, useEffect, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { formatOfficeDate as formatDate, formatOfficeTimestamp as formatTimestamp } from "@/lib/format-office-date"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Search,
  Download,
  Filter,
  Eye,
  Calendar,
  User,
  Mail,
  Phone,
  UserCheck,
  Shield,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { officeFetch } from "@/lib/api-client"
import { officeKeys } from "@/lib/query/keys"
import {
  useOfficeAdminEnabled,
  useOfficeUserMfa,
  useOfficeUserTransactions,
  useOfficeUsersDirectory,
  useQueryInitialLoading,
  type OfficeUserRow,
} from "@/hooks/queries"
import { fetchOfficeUserMfa } from "@/hooks/queries/use-office-user-mfa"
import { fetchOfficeUserTransactions } from "@/hooks/queries/use-office-user-transactions"
import { OFFICE_LIST_STALE_MS } from "@/hooks/queries/constants"
import { OfficeTransactionDetailPanel } from "@/components/transactions/office-transaction-detail-panel"
import type { OfficeTransaction } from "@/lib/types/office-transaction"
import {
  ledgerTransactionStatusDisplay,
  type LedgerTransactionStatusTone,
  VERIFICATION_STATUS_COPY,
  verificationStatusLabel,
} from "@easner/shared"
import { OfficeQueryError } from "@/components/data/office-data-status"
import { OfficePageSkeleton } from "@/components/data/office-page-skeleton"
import { ProcessingFeeOverrideSection } from "@/components/platform-control/processing-fee-override-section"

/** Mirrors `public.users` (+ `email_confirmed_at` merged from auth). */
type UserData = OfficeUserRow

function userDisplayName(user: Pick<UserData, "id" | "email" | "full_name">) {
  const n = (user.full_name || "").trim()
  if (n) return n
  if (user.email) return user.email
  return `${user.id.slice(0, 8)}…`
}

/** Raw Noah status string for table/overview: KYB when user is in a business context, else consumer KYC. */
function resolveOverviewVerificationStatus(user: UserData): string {
  const role = String(user.role || "").toLowerCase()
  const isBizContext = role === "business" || Boolean(user.easner_business_id)
  if (isBizContext && user.verification_status) {
    return String(user.verification_status)
  }
  return String(user.noah_kyc_status || user.noahKycStatus || "not_started")
}

function verificationBadgeVariant(rawStatus: string): "emerald" | "amber" | "oxblood" | "slate" {
  const label = verificationStatusLabel(rawStatus || null)
  if (label === VERIFICATION_STATUS_COPY.verified) return "emerald"
  if (label === VERIFICATION_STATUS_COPY.inReview) return "slate"
  if (label === VERIFICATION_STATUS_COPY.actionNeeded) return "oxblood"
  return "amber"
}

function NoahVerificationBadge({ rawStatus }: { rawStatus: string }) {
  const label = verificationStatusLabel(rawStatus || null)
  return <Badge variant={verificationBadgeVariant(rawStatus)}>{label}</Badge>
}

function AccountRestrictionBadge({ user }: { user: UserData }) {
  const phase = user.accountRestrictionPhase
  if (!phase) return null
  if (phase === "wind_down") {
    return (
      <Badge variant="amber" className="ml-1">
        Wind-down
      </Badge>
    )
  }
  return (
    <Badge variant="oxblood" className="ml-1">
      Suspended
    </Badge>
  )
}

interface TransactionData extends OfficeTransaction {}

function formatProviderLabel(provider: string | null | undefined): string {
  const raw = String(provider || "").trim()
  if (!raw) return "–"
  if (raw.toLowerCase() === "easner_internal") return "Easetag"
  if (raw.toLowerCase() === "yellowcard") return "Yellowcard"
  if (raw.toLowerCase() === "noah") return "Noah"
  return raw
}

function transactionStatusBadgeVariant(
  tone: LedgerTransactionStatusTone,
): "emerald" | "amber" | "oxblood" | "slate" | "outline" {
  switch (tone) {
    case "completed":
      return "emerald"
    case "pending":
      return "amber"
    case "processing":
      return "outline"
    case "failed":
      return "oxblood"
    case "cancelled":
      return "slate"
    default:
      return "outline"
  }
}

/**
 * Rows rendered before "Load more" (O2.4). The directory API
 * (business/app/api/admin/office/users – owned by the business workspace)
 * still returns the whole directory in one response, so pagination here is a
 * render cap: filtering/search always covers every loaded row, we just keep
 * the initial DOM small. Row virtualization was deliberately skipped – the
 * semantic <Table> layout drives column sizing, and absolute-positioned
 * virtual rows would break that alignment.
 */
const USERS_RENDER_PAGE_SIZE = 100

export default function AdminUsersPage() {
  const queryClient = useQueryClient()
  const { authLoading } = useOfficeAdminEnabled()
  const [searchTerm, setSearchTerm] = useState("")
  const [visibleCount, setVisibleCount] = useState(USERS_RENDER_PAGE_SIZE)
  const [roleFilter, setRoleFilter] = useState<"all" | "individual" | "business">("all")
  const [verificationFilter, setVerificationFilter] = useState("all")
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null)
  const [selectedUserTransaction, setSelectedUserTransaction] = useState<TransactionData | null>(null)

  const directoryQuery = useOfficeUsersDirectory()
  const directoryUsers = directoryQuery.data ?? []
  const dirLoading = useQueryInitialLoading(directoryQuery.isPending, directoryQuery.data, directoryUsers)
  const dirError =
    directoryQuery.error instanceof Error
      ? directoryQuery.error.message
      : directoryQuery.error
        ? String(directoryQuery.error)
        : null

  const userTransactionsQuery = useOfficeUserTransactions(selectedUser?.id)
  const userTransactions = userTransactionsQuery.data ?? []
  const userTransactionsLoading = useQueryInitialLoading(
    userTransactionsQuery.isPending,
    userTransactionsQuery.data,
    userTransactions,
  )

  const mfaQuery = useOfficeUserMfa(selectedUser?.id)
  const mfaStatus = {
    loading: mfaQuery.isPending && mfaQuery.data === undefined,
    hasTotp: mfaQuery.data?.hasTotp ?? null,
  }
  const [mfaResetConfirmOpen, setMfaResetConfirmOpen] = useState(false)
  const [mfaResetLoading, setMfaResetLoading] = useState(false)
  const [mfaResetFeedback, setMfaResetFeedback] = useState<{ ok: boolean; message: string } | null>(null)
  const [restrictionConfirmOpen, setRestrictionConfirmOpen] = useState(false)
  const [restrictionLoading, setRestrictionLoading] = useState(false)
  const [restrictionFeedback, setRestrictionFeedback] = useState<{ ok: boolean; message: string } | null>(null)

  const formatAmount = (amount: number | null | undefined, currencyCode: string | null | undefined): string => {
    const amt = Number(amount || 0) || 0
    const cur = String(currencyCode || "").toUpperCase()
    return `${amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`
  }

  const transactionDisplayAmount = (tx: TransactionData): string => {
    if (tx.amountFormatted) return tx.amountFormatted
    return formatAmount(tx.displayAmount ?? tx.amount, tx.displayCurrency ?? tx.currency)
  }

  const transactionImpactAmount = (tx: TransactionData): string => {
    return tx.impactFormatted || tx.balanceFormatted || ""
  }

  const usersWithStats = directoryUsers

  useEffect(() => {
    if (typeof window === "undefined") return
    const id = new URLSearchParams(window.location.search).get("highlight")
    if (!id || usersWithStats.length === 0) return
    const foundIndex = usersWithStats.findIndex((u: UserData) => u.id === id)
    const found = foundIndex >= 0 ? usersWithStats[foundIndex] : undefined
    if (found) {
      setSelectedUser(found)
      // Make sure the highlighted row is inside the rendered slice.
      setVisibleCount((count) => Math.max(count, foundIndex + 1))
      requestAnimationFrame(() => {
        document.querySelector(`[data-user-row="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
      })
    }
  }, [usersWithStats])

  // Filter on the debounced term so typing stays at frame rate.
  const deferredSearchTerm = useDebouncedValue(searchTerm, 250)
  const filteredUsers = useMemo(() => {
    const q = deferredSearchTerm.toLowerCase()
    return usersWithStats.filter((user: UserData) => {
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
  }, [usersWithStats, deferredSearchTerm, roleFilter, verificationFilter])

  // Reset the render cap whenever the visible result set changes shape.
  useEffect(() => {
    setVisibleCount(USERS_RENDER_PAGE_SIZE)
  }, [deferredSearchTerm, roleFilter, verificationFilter])

  const visibleUsers = useMemo(
    () => (filteredUsers.length > visibleCount ? filteredUsers.slice(0, visibleCount) : filteredUsers),
    [filteredUsers, visibleCount],
  )
  const hasMoreToRender = filteredUsers.length > visibleUsers.length

  function accountTypeLabel(user: UserData): "Consumer" | "Business" | null {
    const role = String(user.role || "").toLowerCase()
    const hasOrg = Boolean(user.easner_business_id)
    // A linked business always wins – role can be stale when bootstrap fallback omits it.
    if (role === "business" || hasOrg) return "Business"
    if (role === "individual" || user.totalTransactions > 0) return "Consumer"
    return null
  }

  /** Which verification rows to show in the user detail dialog (mobile KYC vs business KYB). */
  function dialogVerificationRows(user: UserData) {
    const at = accountTypeLabel(user)
    return {
      showIdentity: at === "Consumer" || at === null,
      showBusiness: at === "Business",
    }
  }

  const getAccountTypeBadge = (user: UserData) => {
    const label = accountTypeLabel(user)
    if (!label) return <span className="text-xs text-muted-foreground">–</span>
    const variant: "emerald" | "slate" = label === "Business" ? "emerald" : "slate"
    return <Badge variant={variant}>{label}</Badge>
  }

  const getEasnerRoleBadge = (role: string | null | undefined) => {
    const r = String(role || "individual").toLowerCase()
    const isBiz = r === "business"
    return (
      <Badge variant={isBiz ? "emerald" : "slate"}>
        {isBiz ? "Business" : "Individual"}
      </Badge>
    )
  }

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

  const handleUserSelect = (user: UserData) => {
    setSelectedUser(user)
    setMfaResetFeedback(null)
    setRestrictionFeedback(null)
  }

  const prefetchUserDetails = (userId: string) => {
    void queryClient.prefetchQuery({
      queryKey: officeKeys.userTransactions(userId),
      queryFn: () => fetchOfficeUserTransactions(userId),
      staleTime: OFFICE_LIST_STALE_MS,
    })
    void queryClient.prefetchQuery({
      queryKey: officeKeys.userMfa(userId),
      queryFn: () => fetchOfficeUserMfa(userId),
      staleTime: 60_000,
    })
  }

  const handleConfirmResetMfa = async () => {
    if (!selectedUser) return
    setMfaResetLoading(true)
    try {
      const r = await officeFetch(`/api/admin/office/users/${selectedUser.id}/reset-mfa`, { method: "POST" })
      const d = (await r.json().catch(() => ({}))) as {
        error?: string
        message?: string
        removed?: number
        ok?: boolean
      }
      if (!r.ok) {
        const err =
          typeof d.error === "string"
            ? d.error
            : r.status === 501
              ? "This environment cannot reset MFA (Supabase admin MFA API unavailable)."
              : "Failed to reset MFA"
        setMfaResetFeedback({ ok: false, message: err })
        return
      }
      const msg =
        typeof d.message === "string" && d.message.trim()
          ? d.message
          : `Removed ${Number(d.removed ?? 0)} authenticator factor(s). User can sign in with password and set up MFA again.`
      setMfaResetFeedback({ ok: true, message: msg })
      setMfaResetConfirmOpen(false)
      if (Number(d.removed ?? 0) > 0 && selectedUser?.id) {
        void queryClient.invalidateQueries({ queryKey: officeKeys.userMfa(selectedUser.id) })
      }
      void queryClient.invalidateQueries({ queryKey: officeKeys.users() })
    } catch (e: unknown) {
      setMfaResetFeedback({ ok: false, message: e instanceof Error ? e.message : "Request failed" })
    } finally {
      setMfaResetLoading(false)
    }
  }

  const handleConfirmRestrictAccount = async () => {
    if (!selectedUser) return
    setRestrictionLoading(true)
    try {
      const r = await officeFetch(`/api/admin/office/users/${selectedUser.id}/restriction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Office compliance restriction" }),
      })
      const d = (await r.json().catch(() => ({}))) as { error?: string; applied?: boolean }
      if (!r.ok) {
        setRestrictionFeedback({
          ok: false,
          message: typeof d.error === "string" ? d.error : "Failed to restrict account",
        })
        return
      }
      setRestrictionFeedback({
        ok: true,
        message: d.applied
          ? "Account restricted. Deposits are blocked; the user has 48 hours to move funds out."
          : "Account was already restricted.",
      })
      setRestrictionConfirmOpen(false)
      void queryClient.invalidateQueries({ queryKey: officeKeys.users() })
    } catch (e: unknown) {
      setRestrictionFeedback({ ok: false, message: e instanceof Error ? e.message : "Request failed" })
    } finally {
      setRestrictionLoading(false)
    }
  }

  const handleLiftRestriction = async () => {
    if (!selectedUser) return
    setRestrictionLoading(true)
    try {
      const r = await officeFetch(`/api/admin/office/users/${selectedUser.id}/restriction`, { method: "DELETE" })
      const d = (await r.json().catch(() => ({}))) as { error?: string; lifted?: boolean }
      if (!r.ok) {
        setRestrictionFeedback({
          ok: false,
          message: typeof d.error === "string" ? d.error : "Failed to lift restriction",
        })
        return
      }
      setRestrictionFeedback({
        ok: true,
        message: d.lifted ? "Restriction lifted." : "No active restriction found.",
      })
      void queryClient.invalidateQueries({ queryKey: officeKeys.users() })
    } catch (e: unknown) {
      setRestrictionFeedback({ ok: false, message: e instanceof Error ? e.message : "Request failed" })
    } finally {
      setRestrictionLoading(false)
    }
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

  if (authLoading || (dirLoading && directoryUsers.length === 0 && !dirError)) {
    return (
      <>
        <OfficePageSkeleton cards={2} />
      </>
    )
  }

  return (
    <>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleExport}
              variant="outline"
              title="Exports the currently loaded rows after active filters"
            >
              <Download className="h-4 w-4 mr-2" />
              Export loaded
            </Button>
          </div>
        </div>

        <OfficeQueryError
          message={dirError}
          hasData={directoryUsers.length > 0}
          onRetry={() => void directoryQuery.refetch()}
        />

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

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

              <Button variant="outline" className="w-full bg-transparent">
                <Calendar className="h-4 w-4 mr-2" />
                Date Range
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
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
                {visibleUsers.map((user: UserData) => (
                  <TableRow key={user.id} data-user-row={user.id}>
                    <TableCell className="text-left font-medium">{userDisplayName(user)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate" title={user.email || ""}>
                      {user.email || "–"}
                    </TableCell>
                    <TableCell className="text-center">{getAccountTypeBadge(user)}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        <NoahVerificationBadge rawStatus={resolveOverviewVerificationStatus(user)} />
                        <AccountRestrictionBadge user={user} />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onPointerEnter={() => prefetchUserDetails(user.id)}
                          onFocus={() => prefetchUserDetails(user.id)}
                          onClick={() => handleUserSelect(user)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {filteredUsers.length === 0 && (
              <div className="text-center py-8 text-gray-500">No users found matching your criteria.</div>
            )}

            {hasMoreToRender ? (
              <div className="flex items-center justify-center gap-3 pt-4">
                <span className="text-sm text-muted-foreground">
                  Showing {visibleUsers.length} of {filteredUsers.length}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setVisibleCount((count) => count + USERS_RENDER_PAGE_SIZE)}
                >
                  Load more
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/*
          ONE controlled dialog for the whole table (house pattern from
          app/businesses/page.tsx). A Dialog per row eagerly rebuilt N
          identical ~290-line detail trees on every render — with 500 users
          that was tens of thousands of element allocations per search
          keystroke.
        */}
        <Dialog
          open={Boolean(selectedUser)}
          onOpenChange={(open) => {
            if (!open) setSelectedUser(null)
          }}
        >
          <DialogContent className="flex max-h-[min(88vh,920px)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
                            <DialogHeader className="shrink-0 space-y-0 border-b px-6 py-4 pr-12 text-left">
                              <DialogTitle>User – {selectedUser ? userDisplayName(selectedUser) : ""}</DialogTitle>
                            </DialogHeader>
                            {selectedUser && (() => {
                              const ver = dialogVerificationRows(selectedUser)
                              const hasBizContext =
                                Boolean(selectedUser.easner_business_id) ||
                                String(selectedUser.role || "").toLowerCase() === "business"
                              const usesMobileApp = Boolean(selectedUser.hasExpoPushToken)
                              const p = selectedUser.communicationPreferences
                              return (
                                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                                  <div className="space-y-6">
                                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                      <div className="space-y-2 text-sm">
                                        <div className="flex items-center gap-2">
                                          <User className="h-4 w-4 text-gray-400" />
                                          <span>{userDisplayName(selectedUser)}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Mail className="h-4 w-4 text-gray-400" />
                                          <span>{selectedUser.email || "–"}</span>
                                        </div>
                                        {selectedUser.phone ? (
                                          <div className="flex items-center gap-2">
                                            <Phone className="h-4 w-4 text-gray-400" />
                                            <span>{selectedUser.phone}</span>
                                          </div>
                                        ) : null}
                                        {selectedUser.date_of_birth ? (
                                          <div className="flex justify-between gap-4">
                                            <span className="text-gray-600">Date of birth</span>
                                            <span>{formatDate(selectedUser.date_of_birth)}</span>
                                          </div>
                                        ) : null}
                                        {ver.showIdentity ? (
                                          <div className="flex justify-between gap-4 items-center">
                                            <span className="text-gray-600">Identity verification</span>
                                            <NoahVerificationBadge rawStatus={selectedUser.noah_kyc_status || "not_started"} />
                                          </div>
                                        ) : null}
                                      </div>
                                      <div className="space-y-2 text-sm">
                                        <div className="flex justify-between gap-4">
                                          <span className="text-gray-600">Created</span>
                                          <span>{formatTimestamp(selectedUser.created_at)}</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                          <span className="text-gray-600">Completed transactions</span>
                                          <span className="font-medium">{selectedUser.totalTransactions}</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                          <span className="text-gray-600">Account type</span>
                                          {getEasnerRoleBadge(selectedUser.role)}
                                        </div>
                                        {ver.showBusiness ? (
                                          <div className="flex justify-between gap-4 items-center">
                                            <span className="text-gray-600">Business verification</span>
                                            <NoahVerificationBadge rawStatus={selectedUser.verification_status || "not_started"} />
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-stretch">
                                      <div className="flex h-full flex-col rounded-lg border bg-muted/20 p-3">
                                        <label className="text-sm font-medium text-gray-900">Account security</label>
                                        <div className="mt-2 flex flex-1 flex-col justify-start space-y-2">
                                          {mfaResetFeedback ? (
                                            <p
                                              className={`text-sm rounded-xl border px-3 py-2 ${
                                                mfaResetFeedback.ok
                                                  ? "border-primary/20 bg-primary/10 text-primary"
                                                  : "border-[hsl(var(--destructive)/0.25)] bg-[hsl(var(--destructive)/0.08)] text-destructive"
                                              }`}
                                            >
                                              {mfaResetFeedback.message}
                                            </p>
                                          ) : null}
                                          {mfaStatus.loading ? (
                                            <Skeleton className="h-9 w-36" />
                                          ) : mfaStatus.hasTotp ? (
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              className="border-amber-200 text-amber-900 hover:bg-amber-50"
                                              onClick={() => {
                                                setMfaResetFeedback(null)
                                                setMfaResetConfirmOpen(true)
                                              }}
                                            >
                                              <Shield className="h-4 w-4 mr-2" />
                                              Reset MFA
                                            </Button>
                                          ) : (
                                            <Button type="button" variant="secondary" size="sm" disabled className="font-normal">
                                              Not active
                                            </Button>
                                          )}
                                          {restrictionFeedback ? (
                                            <p
                                              className={`text-sm rounded-xl border px-3 py-2 ${
                                                restrictionFeedback.ok
                                                  ? "border-primary/20 bg-primary/10 text-primary"
                                                  : "border-[hsl(var(--destructive)/0.25)] bg-[hsl(var(--destructive)/0.08)] text-destructive"
                                              }`}
                                            >
                                              {restrictionFeedback.message}
                                            </p>
                                          ) : null}
                                          {selectedUser.accountRestrictionPhase ? (
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              disabled={restrictionLoading}
                                              onClick={() => void handleLiftRestriction()}
                                            >
                                              Lift restriction
                                            </Button>
                                          ) : (
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              className="border-amber-200 text-amber-900 hover:bg-amber-50"
                                              disabled={restrictionLoading}
                                              onClick={() => {
                                                setRestrictionFeedback(null)
                                                setRestrictionConfirmOpen(true)
                                              }}
                                            >
                                              Restrict account
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex h-full flex-col rounded-lg border bg-muted/20 p-3">
                                        <label className="text-sm font-medium text-gray-900">Communication preferences</label>
                                        <div className="mt-2 flex flex-1 flex-col">
                                          {p ? (
                                            <div className="flex flex-wrap gap-1.5 text-sm">
                                              <Badge variant={p.productUpdates ? "default" : "secondary"}>
                                                Product {p.productUpdates ? "on" : "off"}
                                              </Badge>
                                              <Badge variant={p.securityAlerts ? "default" : "secondary"}>
                                                Security {p.securityAlerts ? "on" : "off"}
                                              </Badge>
                                              <Badge variant={p.marketingEmails ? "default" : "secondary"}>
                                                Marketing {p.marketingEmails ? "on" : "off"}
                                              </Badge>
                                              {hasBizContext ? (
                                                <>
                                                  {usesMobileApp ? (
                                                    <Badge
                                                      variant="outline"
                                                      className="border-dashed font-normal"
                                                      title="Easner mobile app · push channel"
                                                    >
                                                      Mobile · Push {p.channels.push ? "on" : "off"} · Registered
                                                    </Badge>
                                                  ) : null}
                                                  <Badge
                                                    variant="outline"
                                                    className="border-dashed font-normal"
                                                    title="Easner business web · email channel"
                                                  >
                                                    Email {p.channels.email ? "on" : "off"}
                                                  </Badge>
                                                </>
                                              ) : (
                                                <>
                                                  <Badge
                                                    variant="outline"
                                                    className="border-dashed font-normal"
                                                    title="Easner mobile app · push channel"
                                                  >
                                                    Mobile · Push {p.channels.push ? "on" : "off"}
                                                    {usesMobileApp ? " · Registered" : " · No device"}
                                                  </Badge>
                                                  <Badge variant="outline" className="border-dashed font-normal" title="Account email notifications">
                                                    Email {p.channels.email ? "on" : "off"}
                                                  </Badge>
                                                </>
                                              )}
                                            </div>
                                          ) : (
                                            <p className="text-sm text-muted-foreground">No preferences on file</p>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {selectedUser.easner_business_id ? (
                                      <div>
                                        <label className="text-sm font-medium text-gray-600">Linked business</label>
                                        <div className="mt-2 rounded-md border p-3 text-sm">
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="font-medium">
                                              {selectedUser.linkedBusinessName?.trim()
                                                ? selectedUser.linkedBusinessName
                                                : "–"}
                                            </span>
                                            <Link
                                              href={`/businesses?highlight=${encodeURIComponent(selectedUser.easner_business_id)}`}
                                              className="text-primary underline-offset-2 hover:underline"
                                            >
                                              Open
                                            </Link>
                                          </div>
                                        </div>
                                      </div>
                                    ) : null}

                                    <ProcessingFeeOverrideSection
                                      subjectType="user"
                                      subjectId={selectedUser.id}
                                    />

                                    <div>
                                      <label className="text-sm font-medium text-gray-600">Recent Transactions</label>
                                      <div className="mt-2 max-h-64 overflow-y-auto rounded-md border">
                                        {userTransactionsLoading ? (
                                          <div className="space-y-2 p-3">
                                            <Skeleton className="h-8 w-full" />
                                            <Skeleton className="h-8 w-full" />
                                            <Skeleton className="h-8 w-full" />
                                          </div>
                                        ) : (
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead>Label</TableHead>
                                              <TableHead>Date</TableHead>
                                              <TableHead>Product</TableHead>
                                              <TableHead>Amount</TableHead>
                                              <TableHead>Impact</TableHead>
                                              <TableHead>Status</TableHead>
                                              <TableHead className="w-[4.5rem]">View</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {userTransactions.map((transaction) => {
                                              const { label: statusLabel, tone } = ledgerTransactionStatusDisplay(
                                                transaction.status,
                                              )
                                              return (
                                                <TableRow key={transaction.id}>
                                                  <TableCell>
                                                    <div className="font-medium text-sm">
                                                      {transaction.label ||
                                                        transaction.easner_transaction_id ||
                                                        transaction.id}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                      {formatProviderLabel(transaction.provider)}
                                                    </div>
                                                  </TableCell>
                                                  <TableCell>
                                                    {formatTimestamp(transaction.occurred_at || transaction.created_at)}
                                                  </TableCell>
                                                  <TableCell>
                                                    {transaction.productLabel ? (
                                                      <Badge variant="outline">{transaction.productLabel}</Badge>
                                                    ) : (
                                                      "–"
                                                    )}
                                                  </TableCell>
                                                  <TableCell>
                                                    <div className="font-medium tabular-nums">
                                                      {transactionDisplayAmount(transaction)}
                                                    </div>
                                                    {transaction.flowLabel ? (
                                                      <div className="text-xs text-muted-foreground">
                                                        {transaction.flowLabel}
                                                      </div>
                                                    ) : null}
                                                  </TableCell>
                                                  <TableCell className="tabular-nums text-sm text-muted-foreground">
                                                    {transactionImpactAmount(transaction) || "–"}
                                                  </TableCell>
                                                  <TableCell>
                                                    <Badge variant={transactionStatusBadgeVariant(tone)}>
                                                      {statusLabel}
                                                    </Badge>
                                                  </TableCell>
                                                  <TableCell>
                                                    <Button
                                                      variant="outline"
                                                      size="sm"
                                                      onClick={() => setSelectedUserTransaction(transaction)}
                                                    >
                                                      <Eye className="h-4 w-4" />
                                                    </Button>
                                                  </TableCell>
                                                </TableRow>
                                              )
                                            })}
                                            {userTransactions.length === 0 && (
                                              <TableRow>
                                                <TableCell colSpan={7} className="text-center py-4 text-gray-500">
                                                  No transactions found
                                                </TableCell>
                                              </TableRow>
                                            )}
                                          </TableBody>
                                        </Table>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}
          </DialogContent>
        </Dialog>

        {/* One controlled dialog for the user-transaction rows (was one per row). */}
        <Dialog
          open={Boolean(selectedUserTransaction)}
          onOpenChange={(open) => {
            if (!open) setSelectedUserTransaction(null)
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Transaction Details</DialogTitle>
            </DialogHeader>
            {selectedUserTransaction ? (
              <div className="overflow-y-auto flex-1 pr-2 -mr-2">
                <OfficeTransactionDetailPanel transaction={selectedUserTransaction} />
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <AlertDialog open={mfaResetConfirmOpen} onOpenChange={setMfaResetConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset authenticator MFA?</AlertDialogTitle>
              <AlertDialogDescription className="text-left space-y-2">
                <span className="block">
                  This removes TOTP (authenticator app) factors for{" "}
                  <span className="font-medium text-foreground">
                    {selectedUser ? userDisplayName(selectedUser) : "this user"}
                  </span>
                  . Existing sessions may be signed out.
                </span>
                <span className="block text-muted-foreground">
                  Only use this for verified support cases (lost phone, broken app, lockout).
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={mfaResetLoading}>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={mfaResetLoading || !selectedUser}
                onClick={() => void handleConfirmResetMfa()}
              >
                {mfaResetLoading ? "Resetting…" : "Reset MFA"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={restrictionConfirmOpen} onOpenChange={setRestrictionConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Restrict this account?</AlertDialogTitle>
              <AlertDialogDescription className="text-left space-y-2">
                <span className="block">
                  Deposits will be blocked immediately for{" "}
                  <span className="font-medium text-foreground">
                    {selectedUser ? userDisplayName(selectedUser) : "this user"}
                  </span>
                  . They will have 48 hours to move funds out before login is suspended.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={restrictionLoading}>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={restrictionLoading || !selectedUser}
                onClick={() => void handleConfirmRestrictAccount()}
              >
                {restrictionLoading ? "Restricting…" : "Restrict account"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  )
}
