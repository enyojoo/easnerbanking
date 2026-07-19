"use client"

import { useState, useEffect, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
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
import { OfficeTransactionDetailPanel } from "@/components/transactions/office-transaction-detail-panel"
import type { OfficeTransaction } from "@/lib/types/office-transaction"
import {
  ledgerTransactionStatusDisplay,
  type LedgerTransactionStatusTone,
} from "@easner/shared"

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
  if (isBizContext && user.noah_kyb_status) {
    return String(user.noah_kyb_status)
  }
  return String(user.noah_kyc_status || user.noahKycStatus || "not_started")
}

function NoahVerificationBadge({ rawStatus }: { rawStatus: string }) {
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

interface TransactionData extends OfficeTransaction {}

function formatProviderLabel(provider: string | null | undefined): string {
  const raw = String(provider || "").trim()
  if (!raw) return "—"
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

export default function AdminUsersPage() {
  const queryClient = useQueryClient()
  const { authLoading } = useOfficeAdminEnabled()
  const [searchTerm, setSearchTerm] = useState("")
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

  const formatTimestamp = (dateString: string) => {
    const date = new Date(dateString)
    const month = date.toLocaleString("en-US", { month: "short" })
    const day = date.getDate().toString().padStart(2, "0")
    const year = date.getFullYear()
    const hours = date.getHours()
    const minutes = date.getMinutes().toString().padStart(2, "0")
    const ampm = hours >= 12 ? "PM" : "AM"
    const displayHours = hours % 12 || 12
    // Format: "Nov 07, 2025 • 7:29 PM"
    return `${month} ${day}, ${year} • ${displayHours}:${minutes} ${ampm}`
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const month = date.toLocaleString("en-US", { month: "short" })
    const day = date.getDate().toString().padStart(2, "0")
    const year = date.getFullYear()
    // Format: "Nov 07, 2025"
    return `${month} ${day}, ${year}`
  }

  const usersWithStats = useMemo(() => directoryUsers, [directoryUsers])

  useEffect(() => {
    if (typeof window === "undefined") return
    const id = new URLSearchParams(window.location.search).get("highlight")
    if (!id || usersWithStats.length === 0) return
    const found = usersWithStats.find((u: UserData) => u.id === id)
    if (found) {
      setSelectedUser(found)
      requestAnimationFrame(() => {
        document.querySelector(`[data-user-row="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
      })
    }
  }, [usersWithStats])

  const filteredUsers = usersWithStats.filter((user: UserData) => {
    const q = searchTerm.toLowerCase()
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

  function accountTypeLabel(user: UserData): "Consumer" | "Business" | "Both" | null {
    const role = String(user.role || "").toLowerCase()
    const hasOrg = Boolean(user.easner_business_id)
    const isBusiness = role === "business" || hasOrg
    const isConsumer = role === "individual" || user.totalTransactions > 0
    if (isBusiness && isConsumer) return "Both"
    if (isBusiness) return "Business"
    if (isConsumer) return "Consumer"
    return null
  }

  /** Which verification rows to show in the user detail dialog (mobile KYC vs business KYB). */
  function dialogVerificationRows(user: UserData) {
    const at = accountTypeLabel(user)
    return {
      showIdentity: at === "Consumer" || at === "Both" || at === null,
      showBusiness: at === "Business" || at === "Both",
    }
  }

  const getAccountTypeBadge = (user: UserData) => {
    const label = accountTypeLabel(user)
    if (!label) return <span className="text-xs text-muted-foreground">—</span>
    const variant: "emerald" | "slate" | "outline" =
      label === "Both" ? "outline" : label === "Business" ? "emerald" : "slate"
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
          u.noah_kyb_status || "",
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
  }

  const handleUserSelect = (user: UserData) => {
    setSelectedUser(user)
    setMfaResetFeedback(null)
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

  const registrationStats = {
    totalUsers: directoryUsers.length,
    verifiedUsers: directoryUsers.filter((u) => resolveOverviewVerificationStatus(u) === "approved").length,
    newThisWeek: directoryUsers.filter(
      (u) => new Date(u.created_at).getTime() > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).getTime(),
    ).length,
  }

  if (authLoading || (dirLoading && directoryUsers.length === 0 && !dirError)) {
    return (
      <OfficeDashboardLayout>
        <div className="p-6 space-y-4">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-24 w-full max-w-4xl" />
          <Skeleton className="h-72 w-full" />
        </div>
      </OfficeDashboardLayout>
    )
  }

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleExport} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export Users
            </Button>
          </div>
        </div>

        {dirError ? (
          <p className="text-sm text-destructive rounded-xl border border-[hsl(var(--destructive)/0.25)] bg-[hsl(var(--destructive)/0.08)] px-4 py-3">
            {dirError}
          </p>
        ) : null}

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
                {filteredUsers.map((user: UserData) => (
                  <TableRow key={user.id} data-user-row={user.id}>
                    <TableCell className="text-left font-medium">{userDisplayName(user)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate" title={user.email || ""}>
                      {user.email || "—"}
                    </TableCell>
                    <TableCell className="text-center">{getAccountTypeBadge(user)}</TableCell>
                    <TableCell className="text-center">
                      <NoahVerificationBadge rawStatus={resolveOverviewVerificationStatus(user)} />
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" onClick={() => handleUserSelect(user)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="flex max-h-[min(88vh,920px)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
                            <DialogHeader className="shrink-0 space-y-0 border-b px-6 py-4 pr-12 text-left">
                              <DialogTitle>User — {selectedUser ? userDisplayName(selectedUser) : ""}</DialogTitle>
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
                                          <span>{selectedUser.email || "—"}</span>
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
                                            <NoahVerificationBadge rawStatus={selectedUser.noah_kyb_status || "not_started"} />
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
                                                : "—"}
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
                                                      "—"
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
                                                    {transactionImpactAmount(transaction) || "—"}
                                                  </TableCell>
                                                  <TableCell>
                                                    <Badge variant={transactionStatusBadgeVariant(tone)}>
                                                      {statusLabel}
                                                    </Badge>
                                                  </TableCell>
                                                  <TableCell>
                                                    <Dialog>
                                                      <DialogTrigger asChild>
                                                        <Button
                                                          variant="outline"
                                                          size="sm"
                                                          onClick={() => setSelectedUserTransaction(transaction)}
                                                        >
                                                          <Eye className="h-4 w-4" />
                                                        </Button>
                                                      </DialogTrigger>
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {filteredUsers.length === 0 && (
              <div className="text-center py-8 text-gray-500">No users found matching your criteria.</div>
            )}
          </CardContent>
        </Card>

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
      </div>
    </OfficeDashboardLayout>
  )
}
