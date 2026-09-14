"use client"

import Link from "next/link"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { OfficeCaseHeader } from "./office-case-header"
import { OfficeCaseTabBar, OfficeCaseTabPanel, Tabs } from "./office-case-tabs"
import { OfficeIdentityPanel } from "./office-identity-panel"
import { OfficeBankingPanel } from "./office-banking-panel"
import { OfficeActivityPane } from "./office-activity-pane"
import { OfficeSecurityPanel } from "./office-security-panel"
import { OfficeAuditPanel } from "./office-audit-panel"
import { OfficeRestrictionControls } from "./office-restriction-controls"
import { OfficeCopyChip, OfficeCopyValue } from "./office-copy-value"
import { OfficePartnerSync } from "./office-partner-sync"
import { OfficeDetailRow, OfficeSection } from "./office-detail-grid"
import { ProcessingFeeOverrideSection } from "@/components/platform-control/processing-fee-override-section"
import {
  useOfficeSubjectAudit,
  useOfficeSubjectBanking,
  useOfficeUserTransactions,
  useOfficeUsersDirectory,
  useQueryInitialLoading,
  type OfficeUserRow,
} from "@/hooks/queries"
import { fetchOfficeSubjectAudit, fetchOfficeSubjectBanking } from "@/hooks/queries/use-office-case"
import { fetchOfficeUserTransactions } from "@/hooks/queries/use-office-user-transactions"
import { fetchOfficeUserMfa } from "@/hooks/queries/use-office-user-mfa"
import { OFFICE_LIST_STALE_MS } from "@/hooks/queries/constants"
import { officeKeys } from "@/lib/query/keys"
import {
  consumerBankKycRail,
  displayText,
  isOrgLinkedUser,
  officeStatusIsApproved,
  officeVerificationBadgeVariant,
} from "@/lib/case/status"
import type { OfficeCaseChip } from "@/lib/case/types"
import { useOfficeCaseTab } from "@/lib/case/use-case-tab"
import { formatOfficeTimestamp } from "@/lib/format-office-date"
import { WALLET_SEND_COMPLIANCE_STATUS_LABEL, verificationStatusLabel } from "@easner/shared"
import { OfficePageSkeleton } from "@/components/data/office-page-skeleton"

const INDIVIDUAL_TABS = [
  { id: "profile", label: "Profile" },
  { id: "banking", label: "Banking" },
  { id: "compliance", label: "Compliance" },
  { id: "activity", label: "Activity" },
  { id: "pricing", label: "Pricing" },
  { id: "security", label: "Security" },
] as const

const ORG_PERSON_TABS = [
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
  { id: "linked", label: "Linked" },
] as const

function userTitle(user: Pick<OfficeUserRow, "id" | "email" | "full_name">): string {
  return (user.full_name || "").trim() || user.email || `${user.id.slice(0, 8)}…`
}

export function prefetchOfficeUserCase(
  queryClient: QueryClient,
  userId: string,
  orgLinked: boolean,
) {
  void queryClient.prefetchQuery({
    queryKey: officeKeys.userMfa(userId),
    queryFn: () => fetchOfficeUserMfa(userId),
    staleTime: 60_000,
  })
  if (orgLinked) return
  void queryClient.prefetchQuery({
    queryKey: officeKeys.userTransactions(userId),
    queryFn: () => fetchOfficeUserTransactions(userId),
    staleTime: OFFICE_LIST_STALE_MS,
  })
  void queryClient.prefetchQuery({
    queryKey: officeKeys.subjectBanking("user", userId),
    queryFn: () => fetchOfficeSubjectBanking("user", userId),
    staleTime: OFFICE_LIST_STALE_MS,
  })
}

export function UserCase({ userId }: { userId: string }) {
  const queryClient = useQueryClient()
  const directoryQuery = useOfficeUsersDirectory()
  const users = directoryQuery.data ?? []
  const loading = useQueryInitialLoading(directoryQuery.isPending, directoryQuery.data, users)
  const user = users.find((row) => row.id === userId) ?? null
  const orgLinked = user ? isOrgLinkedUser(user) : false
  const tabs = orgLinked ? ORG_PERSON_TABS : INDIVIDUAL_TABS
  const tab = useOfficeCaseTab(
    tabs.map((t) => t.id),
    "profile",
  )

  const bankingEnabled = Boolean(user) && !orgLinked && tab.value === "banking"
  const activityEnabled = Boolean(user) && !orgLinked && tab.value === "activity"
  const bankingQuery = useOfficeSubjectBanking("user", userId, bankingEnabled)
  const txQuery = useOfficeUserTransactions(activityEnabled ? userId : null)
  const auditQuery = useOfficeSubjectAudit(userId, Boolean(user) && !orgLinked && tab.value === "compliance")
  const txLoading = useQueryInitialLoading(txQuery.isPending, txQuery.data, txQuery.data ?? [])

  if (loading && !user) return <OfficePageSkeleton cards={0} />
  if (!user) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">This person is not in the directory.</p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href="/users">Back to users</Link>
        </Button>
      </div>
    )
  }

  const rail = consumerBankKycRail(user)
  const kycRaw =
    rail === "bridge"
      ? user.bridge_kyc_status || (user.verification_provider === "bridge" ? user.verification_status : "") || "not_started"
      : user.noah_kyc_status || user.noahKycStatus || "not_started"
  const chips: OfficeCaseChip[] = []
  if (user.accountRestrictionPhase === "locked") chips.push({ label: "Closed", variant: "oxblood" })
  else if (user.accountRestrictionPhase === "wind_down") chips.push({ label: "Restricted", variant: "oxblood" })
  if (!orgLinked) {
    chips.push({
      label: `${rail === "bridge" ? "Bridge" : "Noah"} · ${verificationStatusLabel(kycRaw, { detail: true })}`,
      variant: officeVerificationBadgeVariant(kycRaw),
    })
    if (user.velocityLimitActive) {
      chips.push({ label: WALLET_SEND_COMPLIANCE_STATUS_LABEL, variant: "amber" })
    }
  }

  function prefetchTab(id: string) {
    if (id === "banking") {
      void queryClient.prefetchQuery({
        queryKey: officeKeys.subjectBanking("user", userId),
        queryFn: () => fetchOfficeSubjectBanking("user", userId),
        staleTime: OFFICE_LIST_STALE_MS,
      })
    }
    if (id === "activity") {
      void queryClient.prefetchQuery({
        queryKey: officeKeys.userTransactions(userId),
        queryFn: () => fetchOfficeUserTransactions(userId),
        staleTime: OFFICE_LIST_STALE_MS,
      })
    }
    if (id === "compliance") {
      void queryClient.prefetchQuery({
        queryKey: officeKeys.subjectAudit(userId),
        queryFn: () => fetchOfficeSubjectAudit(userId),
        staleTime: OFFICE_LIST_STALE_MS,
      })
    }
    if (id === "security") {
      void queryClient.prefetchQuery({
        queryKey: officeKeys.userMfa(userId),
        queryFn: () => fetchOfficeUserMfa(userId),
        staleTime: 60_000,
      })
    }
  }

  return (
    <Tabs value={tab.value} onValueChange={tab.onValueChange} className="-mx-4 -my-6 sm:-mx-6 lg:-mx-8">
      <OfficeCaseHeader
        backHref="/users"
        backLabel="Users"
        avatarUrl={user.avatar_url}
        title={userTitle(user)}
        subtitle={user.email || undefined}
        chips={chips}
        ids={
          orgLinked ? null : (
            <>
              <OfficeCopyChip label="Bridge" value={user.bridge_customer_id} />
              <OfficeCopyChip label="Noah" value={user.noah_customer_id} />
            </>
          )
        }
        actions={
          <>
            {orgLinked && user.easner_business_id ? (
              <Button asChild size="sm">
                <Link href={`/businesses/${user.easner_business_id}`}>Open business</Link>
              </Button>
            ) : null}
            {!orgLinked ? (
              <OfficeRestrictionControls
                compact
                kind="user"
                subjectId={user.id}
                phase={user.accountRestrictionPhase}
                source={user.accountRestrictionSource}
                windDownEndsAt={user.accountRestrictionWindDownEndsAt}
              />
            ) : null}
          </>
        }
        tabs={<OfficeCaseTabBar tabs={[...tabs]} onTabHover={prefetchTab} />}
      />
      <div className="px-6 py-5">
          <OfficeCaseTabPanel value="profile">
            <OfficeIdentityPanel user={user} showBankRail={!orgLinked} />
          </OfficeCaseTabPanel>
          {orgLinked ? (
            <>
              <OfficeCaseTabPanel value="security">
                <OfficeSecurityPanel user={user} />
              </OfficeCaseTabPanel>
              <OfficeCaseTabPanel value="linked">
                <OfficeSection
                  title="Linked business"
                  action={
                    user.easner_business_id ? (
                      <Button asChild size="sm">
                        <Link href={`/businesses/${user.easner_business_id}`}>Open business</Link>
                      </Button>
                    ) : null
                  }
                >
                  <OfficeDetailRow label="Business">
                    {displayText(user.linkedBusinessName)}
                  </OfficeDetailRow>
                  <OfficeDetailRow label="Role">{displayText(user.role)}</OfficeDetailRow>
                </OfficeSection>
              </OfficeCaseTabPanel>
            </>
          ) : (
            <>
              <OfficeCaseTabPanel value="banking">
                <OfficeBankingPanel
                  kind="user"
                  subjectId={user.id}
                  banking={bankingQuery.data}
                  loading={bankingQuery.isPending && !bankingQuery.data}
                  error={bankingQuery.error instanceof Error ? bankingQuery.error.message : null}
                  onRetry={() => void bankingQuery.refetch()}
                  user={user}
                />
              </OfficeCaseTabPanel>
              <OfficeCaseTabPanel value="compliance">
                <div className="space-y-4">
                  <IndividualCompliance user={user} />
                  <OfficeSection title="Audit" divide={false}>
                    <OfficeAuditPanel
                      entries={auditQuery.data ?? []}
                      loading={auditQuery.isPending && !auditQuery.data}
                      error={auditQuery.error instanceof Error ? auditQuery.error.message : null}
                    />
                  </OfficeSection>
                </div>
              </OfficeCaseTabPanel>
              <OfficeCaseTabPanel value="activity">
                <OfficeActivityPane
                  transactions={txQuery.data ?? []}
                  loading={txLoading}
                  error={txQuery.error instanceof Error ? txQuery.error.message : null}
                />
              </OfficeCaseTabPanel>
              <OfficeCaseTabPanel value="pricing">
                <ProcessingFeeOverrideSection subjectType="user" subjectId={user.id} />
              </OfficeCaseTabPanel>
              <OfficeCaseTabPanel value="security">
                <OfficeSecurityPanel user={user} />
              </OfficeCaseTabPanel>
            </>
          )}
      </div>
    </Tabs>
  )
}

function rejectionText(value: unknown): string | null {
  if (!value) return null
  if (typeof value === "string" && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => {
        if (typeof item === "string") return item.trim()
        if (item && typeof item === "object" && "message" in item) return String((item as { message: unknown }).message)
        return ""
      })
      .filter(Boolean)
    return parts.length ? parts.join("; ") : null
  }
  return null
}

function IndividualCompliance({ user }: { user: OfficeUserRow }) {
  const rail = consumerBankKycRail(user)
  const bridgeStatus = user.bridge_kyc_status || "not_started"
  const noahStatus = user.noah_kyc_status || user.noahKycStatus || "not_started"
  const rejection = rejectionText(user.noah_kyc_rejection_reasons)
  return (
    <OfficeSection
      title="Bank KYC"
      action={<OfficePartnerSync kind="user" subjectId={user.id} user={user} mode={rail === "noah" ? "both" : "bridge"} />}
    >
      <OfficeDetailRow label="Live rail">{rail === "bridge" ? "Bridge" : "Noah"}</OfficeDetailRow>
      <OfficeDetailRow label="Bridge">
        <Badge variant={officeVerificationBadgeVariant(bridgeStatus)}>
          {verificationStatusLabel(bridgeStatus, { detail: true })}
        </Badge>
      </OfficeDetailRow>
      <OfficeCopyValue label="Bridge · customer" value={user.bridge_customer_id} />
      <OfficeDetailRow label={rail === "noah" ? "Noah (live)" : "Noah (legacy)"}>
        <Badge variant={officeVerificationBadgeVariant(noahStatus)}>
          {verificationStatusLabel(noahStatus, { detail: true })}
        </Badge>
      </OfficeDetailRow>
      <OfficeCopyValue label="Noah · customer" value={user.noah_customer_id} />
      {rejection ? <OfficeDetailRow label="Rejection">{rejection}</OfficeDetailRow> : null}
      {user.bridge_cutover_required_at ? (
        <OfficeDetailRow label="Bridge cutover">
          Required {formatOfficeTimestamp(user.bridge_cutover_required_at)}
          {user.bridge_cutover_deadline_at
            ? ` · deadline ${formatOfficeTimestamp(user.bridge_cutover_deadline_at)}`
            : ""}
        </OfficeDetailRow>
      ) : null}
      {rail === "noah" ? (
        <p className="py-2 text-xs text-muted-foreground">NY / blocked geo — Noah remains the live rail.</p>
      ) : null}
      {officeStatusIsApproved(bridgeStatus) ? null : rail === "bridge" && !user.bridge_customer_id ? (
        <p className="py-2 text-xs text-muted-foreground">Bridge geo with Noah cutover pending.</p>
      ) : null}
    </OfficeSection>
  )
}
