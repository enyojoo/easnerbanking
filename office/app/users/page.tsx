"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Search,
  Download,
  Filter,
  Eye,
  Calendar,
  CheckCircle,
  Clock,
  XCircle,
  User,
  Mail,
  Phone,
  UserCheck,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { officeFetch } from "@/lib/api-client"
import { kycService, KYCSubmission } from "@/lib/kyc-service"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth-context"
import type { CommunicationPreferences } from "@easner/shared"

/** Mirrors `public.users` (+ `email_confirmed_at` merged from auth). */
interface UserData {
  id: string
  email: string | null
  full_name: string | null
  phone: string | null
  date_of_birth: string | null
  avatar_url: string | null
  easner_role: string
  easner_business_id: string | null
  created_at: string
  updated_at: string
  noah_customer_id?: string | null
  noah_kyc_status?: string | null
  noah_kyc_rejection_reasons?: unknown
  noah_kyc_metadata?: Record<string, unknown> | null
  noah_signed_agreement_id?: string | null
  noah_wallet_id?: string | null
  noah_usd_virtual_account_id?: string | null
  noah_eur_virtual_account_id?: string | null
  noah_gbp_virtual_account_id?: string | null
  noah_kyb_customer_id?: string | null
  noah_kyb_status?: string | null
  enabled_extra_account_currencies?: string[]
  email_confirmed_at?: string | null
  /** Parsed from API (not raw jsonb). */
  communicationPreferences?: CommunicationPreferences
  hasExpoPushToken?: boolean
  totalTransactions: number
  totalVolume: number
  verificationStatus?: string
  noahKycStatus?: string
}

function userDisplayName(user: Pick<UserData, "id" | "email" | "full_name">) {
  const n = (user.full_name || "").trim()
  if (n) return n
  if (user.email) return user.email
  return `${user.id.slice(0, 8)}…`
}

function CommsSummary({ user }: { user: UserData }) {
  const p = user.communicationPreferences
  if (!p) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  const typeBits = [p.productUpdates ? "Prod" : null, p.securityAlerts ? "Sec" : null, p.marketingEmails ? "Mkt" : null].filter(
    (x): x is string => x != null,
  )
  const ch = [p.channels.email ? "Email" : null, p.channels.push ? "Push" : null].filter(
    (x): x is string => x != null,
  )
  return (
    <div className="flex flex-col items-center gap-0.5 text-center max-w-[160px] mx-auto">
      <div className="flex flex-wrap justify-center gap-0.5">
        {typeBits.length > 0 ? (
          typeBits.map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px] px-1 py-0 font-normal">
              {t}
            </Badge>
          ))
        ) : (
          <span className="text-[10px] text-muted-foreground">No types</span>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground leading-tight">
        {ch.length ? ch.join(" · ") : "No channels"}
        {user.hasExpoPushToken ? " · device" : ""}
      </span>
    </div>
  )
}

interface TransactionData {
  id: string
  created_at: string
  provider?: string | null
  provider_tx_id?: string | null
  direction?: "in" | "out" | null
  amount?: number | null
  currency?: string | null
  status: string
}

export default function AdminUsersPage() {
  const { user, isAdmin, loading: authLoading } = useAuth()
  const [searchTerm, setSearchTerm] = useState("")
  const [roleFilter, setRoleFilter] = useState<"all" | "individual" | "business">("all")
  const [verificationFilter, setVerificationFilter] = useState("all")
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null)
  const [userTransactions, setUserTransactions] = useState<TransactionData[]>([])
  const [saving, setSaving] = useState(false)
  const [kycSubmissions, setKycSubmissions] = useState<KYCSubmission[]>([])
  const [loadingKyc, setLoadingKyc] = useState(false)
  const [selectedKycSubmission, setSelectedKycSubmission] = useState<KYCSubmission | null>(null)
  const [kycReviewDialogOpen, setKycReviewDialogOpen] = useState(false)
  const [kycReviewSubDialogOpen, setKycReviewSubDialogOpen] = useState(false)
  const [reviewStatus, setReviewStatus] = useState<"approved" | "rejected">("approved")
  const [rejectionReason, setRejectionReason] = useState("")
  const [updatingKyc, setUpdatingKyc] = useState(false)
  const [userKycMap, setUserKycMap] = useState<Map<string, KYCSubmission[]>>(new Map())
  const [linkedOrgName, setLinkedOrgName] = useState<string | null>(null)
  const [directoryUsers, setDirectoryUsers] = useState<UserData[]>([])
  const [dirLoading, setDirLoading] = useState(true)
  const [dirError, setDirError] = useState<string | null>(null)

  const formatAmount = (amount: number | null | undefined, currencyCode: string | null | undefined): string => {
    const amt = Number(amount || 0) || 0
    const cur = String(currencyCode || "").toUpperCase()
    return `${amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`
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

  const fetchUserTransactions = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("transactions")
        .select(`
          id,
          created_at,
          provider,
          noah_transaction_id,
          direction,
          amount,
          currency,
          status
        `)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })

      if (error) throw error
      const transformedData = (data || []).map((tx: any) => ({
        id: tx.id,
        created_at: tx.created_at,
        provider: tx.provider ?? null,
        provider_tx_id: tx.noah_transaction_id ?? null,
        direction: tx.direction ?? null,
        amount: tx.amount ?? null,
        currency: tx.currency ?? null,
        status: tx.status,
      }))
      setUserTransactions(transformedData)
    } catch (err) {
      console.error("Error fetching user transactions:", err)
      setUserTransactions([])
    }
  }, [])

  useEffect(() => {
    setUserKycMap(new Map())
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!isAdmin || !user) {
      setDirLoading(false)
      setDirectoryUsers([])
      setDirError(null)
      return
    }

    let cancelled = false
    setDirLoading(true)
    setDirError(null)

    void officeFetch("/api/admin/office/users")
      .then(async (r) => {
        const d = (await r.json()) as { users?: unknown[]; error?: string }
        if (!r.ok || d.error) {
          throw new Error(typeof d.error === "string" ? d.error : "Failed to load users")
        }
        return d.users ?? []
      })
      .then((rows) => {
        if (cancelled) return
        const list: UserData[] = (rows as Record<string, unknown>[]).map((row) => {
          const id = String(row.id)
          const noahKycStatus = String(row.noah_kyc_status || "not_started")
          return {
            ...row,
            id,
            email: (row.email as string | null) ?? null,
            full_name: (row.full_name as string | null) ?? null,
            phone: (row.phone as string | null) ?? null,
            date_of_birth: (row.date_of_birth as string | null) ?? null,
            avatar_url: (row.avatar_url as string | null) ?? null,
            easner_role: String(row.easner_role || "individual"),
            easner_business_id: (row.easner_business_id as string | null) ?? null,
            created_at: String(row.created_at),
            updated_at: String(row.updated_at),
            noah_customer_id: row.noah_customer_id as string | null | undefined,
            noah_kyc_status: row.noah_kyc_status as string | null | undefined,
            noah_kyc_rejection_reasons: row.noah_kyc_rejection_reasons,
            noah_kyc_metadata: row.noah_kyc_metadata as UserData["noah_kyc_metadata"],
            noah_signed_agreement_id: row.noah_signed_agreement_id as string | null | undefined,
            noah_wallet_id: row.noah_wallet_id as string | null | undefined,
            noah_usd_virtual_account_id: row.noah_usd_virtual_account_id as string | null | undefined,
            noah_eur_virtual_account_id: row.noah_eur_virtual_account_id as string | null | undefined,
            noah_gbp_virtual_account_id: row.noah_gbp_virtual_account_id as string | null | undefined,
            noah_kyb_customer_id: row.noah_kyb_customer_id as string | null | undefined,
            noah_kyb_status: row.noah_kyb_status as string | null | undefined,
            enabled_extra_account_currencies: row.enabled_extra_account_currencies as string[] | undefined,
            email_confirmed_at: row.email_confirmed_at as string | null | undefined,
            communicationPreferences: row.communicationPreferences as CommunicationPreferences | undefined,
            hasExpoPushToken: Boolean(row.hasExpoPushToken),
            totalTransactions: 0,
            totalVolume: 0,
            verificationStatus: noahKycStatus === "approved" ? "verified" : "pending",
            noahKycStatus,
          } as UserData
        })
        setDirectoryUsers(list)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setDirError(e instanceof Error ? e.message : "Failed to load users")
          setDirectoryUsers([])
        }
      })
      .finally(() => {
        if (!cancelled) setDirLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [authLoading, isAdmin, user])

  const usersWithStats = useMemo(() => directoryUsers, [directoryUsers])

  useEffect(() => {
    if (typeof window === "undefined") return
    const id = new URLSearchParams(window.location.search).get("highlight")
    if (!id || usersWithStats.length === 0) return
    const found = usersWithStats.find((u: UserData) => u.id === id)
    if (found) {
      setSelectedUser(found)
      void fetchUserTransactions(found.id)
      requestAnimationFrame(() => {
        document.querySelector(`[data-user-row="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
      })
    }
  }, [usersWithStats, fetchUserTransactions])

  useEffect(() => {
    const orgId = selectedUser?.easner_business_id
    if (!orgId) {
      setLinkedOrgName(null)
      return
    }
    let cancelled = false
    void supabase
      .from("businesses")
      .select("name")
      .eq("id", orgId)
      .maybeSingle()
      .then(({ data: row }) => {
        if (!cancelled) setLinkedOrgName(row?.name ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [selectedUser?.easner_business_id])

  const filteredUsers = usersWithStats.filter((user: UserData) => {
    const q = searchTerm.toLowerCase()
    const name = (user.full_name || "").toLowerCase()
    const em = (user.email || "").toLowerCase()
    const matchesSearch = !q || name.includes(q) || em.includes(q) || user.id.toLowerCase().includes(q)

    const role = String(user.easner_role || "individual").toLowerCase()
    const matchesRole = roleFilter === "all" || role === roleFilter
    // Filter by noah_kyc_status
    const noahKycStatus = user.noahKycStatus || user.noah_kyc_status || "not_started"
    let matchesVerification = true
    if (verificationFilter !== "all") {
      if (verificationFilter === "verified") {
        matchesVerification = noahKycStatus === "approved"
      } else if (verificationFilter === "pending") {
        matchesVerification = noahKycStatus !== "approved" && noahKycStatus !== "rejected"
      } else if (verificationFilter === "rejected") {
        matchesVerification = noahKycStatus === "rejected"
      } else if (verificationFilter === "in_review") {
        matchesVerification = noahKycStatus === "under_review" || noahKycStatus === "in_review"
      } else if (verificationFilter === "unverified") {
        matchesVerification = !noahKycStatus || noahKycStatus === "not_started"
      }
    }

    return matchesSearch && matchesRole && matchesVerification
  })

  function accountTypeLabel(user: UserData): "Consumer" | "Business" | "Both" | null {
    const role = String(user.easner_role || "").toLowerCase()
    const hasOrg = Boolean(user.easner_business_id)
    const isBusiness = role === "business" || hasOrg
    const isConsumer = role === "individual" || user.totalTransactions > 0
    if (isBusiness && isConsumer) return "Both"
    if (isBusiness) return "Business"
    if (isConsumer) return "Consumer"
    return null
  }

  const getAccountTypeBadge = (user: UserData) => {
    const label = accountTypeLabel(user)
    if (!label) return <span className="text-xs text-muted-foreground">—</span>
    const cls =
      label === "Both"
        ? "bg-violet-100 text-violet-800 hover:bg-violet-100"
        : label === "Business"
          ? "bg-blue-100 text-blue-800 hover:bg-blue-100"
          : "bg-slate-100 text-slate-800 hover:bg-slate-100"
    return <Badge className={cls}>{label}</Badge>
  }

  const getEasnerRoleBadge = (role: string | null | undefined) => {
    const r = String(role || "individual").toLowerCase()
    const isBiz = r === "business"
    return (
      <Badge className={isBiz ? "bg-indigo-100 text-indigo-800 hover:bg-indigo-100" : "bg-slate-100 text-slate-800 hover:bg-slate-100"}>
        {isBiz ? "Business" : "Individual"}
      </Badge>
    )
  }

  const getVerificationBadge = (user: UserData & { noah_kyc_status?: string }) => {
    // Use noah_kyc_status for KYC verification
    const noahKycStatus = user.noah_kyc_status || "not_started"
    const status = noahKycStatus === "approved" ? "verified" : noahKycStatus === "rejected" ? "rejected" : noahKycStatus === "under_review" ? "in_review" : "pending"
    
    const statusConfig = {
      verified: { color: "bg-green-100 text-green-700", text: "Verified" },
      pending: { color: "bg-amber-100 text-amber-700", text: "Pending" },
      rejected: { color: "bg-red-100 text-red-700", text: "Rejected" },
      in_review: { color: "bg-yellow-100 text-yellow-700", text: "In Review" },
    }

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending

    return (
      <Badge className={`${config.color} hover:${config.color}`}>
        {config.text}
      </Badge>
    )
  }

  function formatBusinessVerificationLabel(st: string | null | undefined) {
    if (!st) return ""
    const s = String(st).toLowerCase()
    if (s === "approved") return "Approved"
    if (s === "rejected") return "Rejected"
    return String(st).replace(/_/g, " ")
  }

  const renderVerificationCell = (u: UserData) => (
    <div className="flex flex-col items-center gap-1">
      {getVerificationBadge(u)}
      {String(u.easner_role).toLowerCase() === "business" && u.noah_kyb_status ? (
        <span className="text-xs text-muted-foreground text-center max-w-[160px] leading-tight">
          Business: {formatBusinessVerificationLabel(u.noah_kyb_status)}
        </span>
      ) : null}
    </div>
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
        "Created",
      ].join(","),
      ...filteredUsers.map((u: UserData) =>
        [
          `"${(u.full_name || "").replace(/"/g, '""')}"`,
          u.email || "",
          u.phone || "",
          u.easner_role || "individual",
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
    fetchUserTransactions(user.id)
  }

  const handleKycOpen = async (user: UserData) => {
    setSelectedUser(user)
    // KYC data is now in users table, no need to fetch from kyc_submissions
    setKycSubmissions([])
    setKycReviewDialogOpen(true)
  }

  const handleKycReview = async () => {
    if (!selectedKycSubmission || !user?.id) return

    setUpdatingKyc(true)
    try {
      await kycService.updateStatus(
        selectedKycSubmission.id,
        reviewStatus,
        user.id,
        reviewStatus === "rejected" ? rejectionReason : undefined
      )
      
      // Reload KYC submissions
      if (selectedUser) {
        const submissions = await kycService.getByUserId(selectedUser.id)
        setKycSubmissions(submissions)
      }
      
      setKycReviewSubDialogOpen(false)
      setSelectedKycSubmission(null)
      setRejectionReason("")
    } catch (error) {
      console.error("Error updating KYC submission:", error)
      alert("Failed to update KYC submission")
    } finally {
      setUpdatingKyc(false)
    }
  }

  const getKycStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-green-100 text-green-800"
      case "in_review":
        return "bg-yellow-100 text-yellow-800"
      case "rejected":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }


  const registrationStats = {
    totalUsers: directoryUsers.length,
    verifiedUsers: directoryUsers.filter((u) => u.noah_kyc_status === "approved").length,
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
            <p className="text-gray-600">Manage user accounts and verification status</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleExport} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export Users
            </Button>
          </div>
        </div>

        {dirError ? (
          <p className="text-sm text-red-600 rounded-md border border-red-200 bg-red-50 px-4 py-3">{dirError}</p>
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
              <UserCheck className="h-4 w-4 text-blue-600" />
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
                  <TableHead className="w-[168px] text-center">Comms</TableHead>
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
                    <TableCell className="text-center">{renderVerificationCell(user)}</TableCell>
                    <TableCell className="text-center align-top py-3">
                      <CommsSummary user={user} />
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" onClick={() => handleUserSelect(user)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl">
                            <DialogHeader>
                              <DialogTitle>User — {selectedUser ? userDisplayName(selectedUser) : ""}</DialogTitle>
                            </DialogHeader>
                            {selectedUser && (
                              <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                  <div className="space-y-4">
                                    <div>
                                      <label className="text-sm font-medium text-gray-600">Profile</label>
                                      <div className="mt-2 space-y-2 text-sm">
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
                                        <div className="flex justify-between gap-4">
                                          <span className="text-gray-600">Email confirmed</span>
                                          <span>{selectedUser.email_confirmed_at ? formatTimestamp(selectedUser.email_confirmed_at) : "No"}</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                          <span className="text-gray-600">Account type</span>
                                          {getEasnerRoleBadge(selectedUser.easner_role)}
                                        </div>
                                        <div className="flex justify-between gap-4 items-center">
                                          <span className="text-gray-600">Identity verification</span>
                                          {getVerificationBadge(selectedUser)}
                                        </div>
                                        <div className="flex justify-between gap-4 items-center">
                                          <span className="text-gray-600">Business verification</span>
                                          <span className="text-sm">
                                            {selectedUser.noah_kyb_status
                                              ? formatBusinessVerificationLabel(selectedUser.noah_kyb_status)
                                              : "—"}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                    {selectedUser.communicationPreferences ? (
                                      <div>
                                        <label className="text-sm font-medium text-gray-600">Communication preferences</label>
                                        <p className="text-xs text-muted-foreground mt-1 mb-2">
                                          Managed by the user in the Easner mobile or business app.
                                        </p>
                                        <div className="mt-2 rounded-md border bg-muted/30 p-3 text-sm space-y-2">
                                          <div className="flex flex-wrap gap-2">
                                            <Badge variant={selectedUser.communicationPreferences.productUpdates ? "default" : "secondary"}>
                                              Product {selectedUser.communicationPreferences.productUpdates ? "on" : "off"}
                                            </Badge>
                                            <Badge variant={selectedUser.communicationPreferences.securityAlerts ? "default" : "secondary"}>
                                              Security {selectedUser.communicationPreferences.securityAlerts ? "on" : "off"}
                                            </Badge>
                                            <Badge variant={selectedUser.communicationPreferences.marketingEmails ? "default" : "secondary"}>
                                              Marketing {selectedUser.communicationPreferences.marketingEmails ? "on" : "off"}
                                            </Badge>
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            Email channel: {selectedUser.communicationPreferences.channels.email ? "on" : "off"} · Push
                                            channel: {selectedUser.communicationPreferences.channels.push ? "on" : "off"}
                                            {selectedUser.hasExpoPushToken ? " · Push token registered" : ""}
                                          </div>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="space-y-4">
                                    <div>
                                      <label className="text-sm font-medium text-gray-600">Record</label>
                                      <div className="mt-2 space-y-2 text-sm">
                                        <div className="flex justify-between gap-4">
                                          <span className="text-gray-600">User id</span>
                                          <span className="font-mono text-xs break-all text-right">{selectedUser.id}</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                          <span className="text-gray-600">Created</span>
                                          <span>{formatTimestamp(selectedUser.created_at)}</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                          <span className="text-gray-600">Updated</span>
                                          <span>{formatTimestamp(selectedUser.updated_at)}</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                          <span className="text-gray-600">Completed transactions</span>
                                          <span className="font-medium">{selectedUser.totalTransactions}</span>
                                        </div>
                                      </div>
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-gray-600">Wallet & provider references</label>
                                      <div className="mt-2 space-y-1.5 text-xs font-mono break-all">
                                        {[
                                          ["Customer", selectedUser.noah_customer_id],
                                          ["Wallet", selectedUser.noah_wallet_id],
                                          ["Signed agreement", selectedUser.noah_signed_agreement_id],
                                          ["USD virtual account", selectedUser.noah_usd_virtual_account_id],
                                          ["EUR virtual account", selectedUser.noah_eur_virtual_account_id],
                                          ["GBP virtual account", selectedUser.noah_gbp_virtual_account_id],
                                          ["Business customer (KYB)", selectedUser.noah_kyb_customer_id],
                                        ].map(([k, v]) =>
                                          v ? (
                                            <div key={k} className="flex flex-col border-b border-border/60 pb-1">
                                              <span className="text-muted-foreground">{k}</span>
                                              <span>{v}</span>
                                            </div>
                                          ) : null,
                                        )}
                                        {(selectedUser.enabled_extra_account_currencies?.length ?? 0) > 0 ? (
                                          <div className="pt-1">
                                            <span className="text-muted-foreground block">Extra account currencies</span>
                                            <span>{selectedUser.enabled_extra_account_currencies?.join(", ")}</span>
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {selectedUser.easner_business_id ? (
                                  <div>
                                    <label className="text-sm font-medium text-gray-600">Businesses</label>
                                    <div className="mt-2 rounded-md border p-3 text-sm">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="font-medium">{linkedOrgName ?? "Linked workspace"}</span>
                                        <Link
                                          href={`/businesses?highlight=${encodeURIComponent(selectedUser.easner_business_id)}`}
                                          className="text-primary underline-offset-2 hover:underline"
                                        >
                                          Open in Businesses
                                        </Link>
                                      </div>
                                    </div>
                                  </div>
                                ) : null}

                                {/* Transaction History */}
                                <div>
                                  <label className="text-sm font-medium text-gray-600">Recent Transactions</label>
                                  <div className="mt-2 max-h-64 overflow-y-auto">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>ID</TableHead>
                                          <TableHead>Date</TableHead>
                                          <TableHead>Provider</TableHead>
                                          <TableHead>Direction</TableHead>
                                          <TableHead>Amount</TableHead>
                                          <TableHead>Status</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {userTransactions.map((transaction) => (
                                          // Remove .slice(0, 5) to show all transactions
                                          <TableRow key={transaction.id}>
                                            <TableCell className="font-mono text-sm">
                                              {transaction.provider_tx_id || transaction.id}
                                            </TableCell>
                                            <TableCell>
                                              {formatTimestamp(transaction.created_at)}
                                            </TableCell>
                                            <TableCell>
                                              {String(transaction.provider || "").toUpperCase() || "—"}
                                            </TableCell>
                                            <TableCell>
                                              {(transaction.direction || "out").toUpperCase()}
                                            </TableCell>
                                            <TableCell>
                                              <div className="font-medium">
                                                {formatAmount(transaction.amount, transaction.currency)}
                                              </div>
                                            </TableCell>
                                            <TableCell>
                                              <Badge
                                                className={
                                                  transaction.status === "completed"
                                                    ? "bg-green-100 text-green-800"
                                                    : transaction.status === "processing"
                                                      ? "bg-yellow-100 text-yellow-800"
                                                      : "bg-gray-100 text-gray-800"
                                                }
                                              >
                                                {transaction.status}
                                              </Badge>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                        {userTransactions.length === 0 && (
                                          <TableRow>
                                            <TableCell colSpan={6} className="text-center py-4 text-gray-500">
                                              No transactions found
                                            </TableCell>
                                          </TableRow>
                                        )}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>

                              </div>
                            )}
                          </DialogContent>
                        </Dialog>

                        {/* KYC Dialog */}
                        <Dialog open={kycReviewDialogOpen} onOpenChange={setKycReviewDialogOpen}>
                          <DialogContent className="max-w-4xl">
                            <DialogHeader>
                              <DialogTitle>KYC — {selectedUser ? userDisplayName(selectedUser) : ""}</DialogTitle>
                            </DialogHeader>
                            {selectedUser && (
                              <div className="space-y-6">
                                <div className="border-t pt-6">
                                  <h3 className="text-lg font-semibold mb-4">Verification status</h3>
                                  {selectedUser.noah_kyc_status ? (
                                    <div className="space-y-3">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm text-gray-600">Status:</span>
                                        {getVerificationBadge(selectedUser)}
                                      </div>
                                      {selectedUser.noah_customer_id && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm text-gray-600">Customer ID</span>
                                          <span className="text-sm font-mono">{selectedUser.noah_customer_id}</span>
                                        </div>
                                      )}
                                      {selectedUser.noah_kyc_status === "rejected" && selectedUser.noah_kyc_rejection_reasons && (
                                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                          <p className="text-sm font-medium text-red-800 mb-1">Rejection Reasons:</p>
                                          <p className="text-sm text-red-700">
                                            {Array.isArray(selectedUser.noah_kyc_rejection_reasons) 
                                              ? selectedUser.noah_kyc_rejection_reasons.join(", ")
                                              : typeof selectedUser.noah_kyc_rejection_reasons === "string"
                                              ? selectedUser.noah_kyc_rejection_reasons
                                              : JSON.stringify(selectedUser.noah_kyc_rejection_reasons)}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                                      <p className="text-gray-500 text-xs">KYC verification not started</p>
                                    </div>
                                  )}
                                </div>

                                {selectedUser.noah_kyc_status === "approved" && (
                                  <>
                                    {(selectedUser.full_name || selectedUser.date_of_birth || selectedUser.noah_kyc_metadata) && (
                                      <div>
                                        <label className="text-sm font-medium text-gray-600">Identity details</label>
                                        <div className="mt-2 space-y-3 text-sm">
                                          <div className="flex items-center justify-between mb-1">
                                            <span className="text-gray-600">KYC</span>
                                            <Badge className="bg-green-100 text-green-700">APPROVED</Badge>
                                          </div>
                                          {selectedUser.full_name ? (
                                            <div className="flex justify-between gap-4">
                                              <span className="text-gray-600">full_name</span>
                                              <span className="text-right">{selectedUser.full_name}</span>
                                            </div>
                                          ) : null}
                                          {selectedUser.date_of_birth ? (
                                            <div className="flex justify-between gap-4">
                                              <span className="text-gray-600">date_of_birth</span>
                                              <span>{new Date(selectedUser.date_of_birth).toLocaleDateString()}</span>
                                            </div>
                                          ) : null}
                                          {(() => {
                                            const meta = selectedUser.noah_kyc_metadata as Record<string, string> | null | undefined
                                            if (!meta) return null
                                            return (
                                              <div className="space-y-2 border-t pt-3">
                                                {meta.ssn ? (
                                                  <div className="flex justify-between">
                                                    <span className="text-gray-600">SSN (last 4)</span>
                                                    <span>***-**-{String(meta.ssn).slice(-4)}</span>
                                                  </div>
                                                ) : null}
                                                {meta.passportNumber ? (
                                                  <div className="flex justify-between">
                                                    <span className="text-gray-600">Passport</span>
                                                    <span>{meta.passportNumber}</span>
                                                  </div>
                                                ) : null}
                                                {meta.nationalIdNumber ? (
                                                  <div className="flex justify-between">
                                                    <span className="text-gray-600">National ID</span>
                                                    <span>{meta.nationalIdNumber}</span>
                                                  </div>
                                                ) : null}
                                              </div>
                                            )
                                          })()}
                                        </div>
                                      </div>
                                    )}

                                    {(() => {
                                      const addr = (selectedUser.noah_kyc_metadata as { address?: Record<string, string> } | null)?.address
                                      if (!addr) {
                                        return (
                                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                                            <p className="text-gray-500 text-xs">No structured address on file</p>
                                          </div>
                                        )
                                      }
                                      return (
                                        <div>
                                          <label className="text-sm font-medium text-gray-600">Address</label>
                                          <div className="mt-2 text-xs text-gray-700 space-y-0.5">
                                            {addr.line1 ? <div>{addr.line1}</div> : null}
                                            {addr.line2 ? <div>{addr.line2}</div> : null}
                                            <div>
                                              {addr.city}
                                              {addr.state ? `, ${addr.state}` : ""}
                                              {addr.postal_code ? ` ${addr.postal_code}` : ""}
                                            </div>
                                            {addr.country ? <div>{addr.country}</div> : null}
                                          </div>
                                        </div>
                                      )
                                    })()}
                                  </>
                                )}
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>

                        {/* KYC Review Sub-Dialog */}
                        <Dialog open={kycReviewSubDialogOpen} onOpenChange={setKycReviewSubDialogOpen}>
                          <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>Review KYC Submission</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label>Decision</Label>
                                <div className="flex gap-2">
                                  <Button
                                    variant={reviewStatus === "approved" ? "default" : "outline"}
                                    onClick={() => setReviewStatus("approved")}
                                    className="flex-1"
                                  >
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Approve
                                  </Button>
                                  <Button
                                    variant={reviewStatus === "rejected" ? "default" : "outline"}
                                    onClick={() => setReviewStatus("rejected")}
                                    className="flex-1 text-red-600 hover:text-red-700"
                                  >
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Reject
                                  </Button>
                                </div>
                              </div>
                              {reviewStatus === "rejected" && (
                                <div className="space-y-2">
                                  <Label htmlFor="rejection-reason">Rejection Reason</Label>
                                  <Textarea
                                    id="rejection-reason"
                                    placeholder="Enter reason for rejection..."
                                    value={rejectionReason}
                                    onChange={(e) => setRejectionReason(e.target.value)}
                                    rows={3}
                                  />
                                </div>
                              )}
                              <div className="flex justify-end gap-2 pt-4">
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setKycReviewSubDialogOpen(false)
                                    setSelectedKycSubmission(null)
                                    setRejectionReason("")
                                  }}
                                  disabled={updatingKyc}
                                >
                                  Cancel
                                </Button>
                                <Button onClick={handleKycReview} disabled={updatingKyc || (reviewStatus === "rejected" && !rejectionReason.trim())}>
                                  {updatingKyc ? "Updating..." : "Submit Review"}
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>

                        <Button variant="outline" size="sm" onClick={() => handleKycOpen(user)}>
                          KYC
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
          </CardContent>
        </Card>
      </div>
    </OfficeDashboardLayout>
  )
}
