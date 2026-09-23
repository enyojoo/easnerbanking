"use client"

import Link from "next/link"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { OfficeCaseHeader } from "./office-case-header"
import { OfficeCaseTabBar, OfficeCaseTabPanel, Tabs } from "./office-case-tabs"
import { OfficeKybPacket } from "./office-kyb-packet"
import { OfficeBankingPanel } from "./office-banking-panel"
import { OfficeActivityPane } from "./office-activity-pane"
import { OfficeAuditPanel } from "./office-audit-panel"
import { OfficeTeamPanel } from "./office-team-panel"
import { OfficeRestrictionControls } from "./office-restriction-controls"
import { OfficeDevPlatformToggle } from "./office-dev-platform-toggle"
import { OfficeCopyChip, OfficeCopyValue } from "./office-copy-value"
import { OfficePartnerSync } from "./office-partner-sync"
import { OfficeExpressDepositsSection } from "./office-express-deposits"
import { OfficeDetailRow, OfficeSection } from "./office-detail-grid"
import { OfficeIdentityPanel } from "./office-identity-panel"
import { ProcessingFeeOverrideSection } from "@/components/platform-control/processing-fee-override-section"
import { CheckoutFeeOverrideSection } from "@/components/platform-control/checkout-fee-override-section"
import { WalletSendComplianceOfficePanel } from "@/components/wallet-send-compliance-office-panel"
import { OfficePageSkeleton } from "@/components/data/office-page-skeleton"
import {
  useOfficeBusinesses,
  useOfficeBusinessMembers,
  useOfficeUsersDirectory,
  useOfficeBusinessTransactions,
  useOfficeKybPacket,
  useOfficeSendCompliance,
  useOfficeSubjectAudit,
  useOfficeSubjectBanking,
  useQueryInitialLoading,
} from "@/hooks/queries"
import {
  fetchOfficeBusinessMembers,
  fetchOfficeBusinessTransactions,
  fetchOfficeKybPacket,
  fetchOfficeSubjectAudit,
  fetchOfficeSubjectBanking,
} from "@/hooks/queries/use-office-case"
import { OFFICE_LIST_STALE_MS } from "@/hooks/queries/constants"
import { officeKeys } from "@/lib/query/keys"
import { expressDepositsOfficeStatus } from "@/lib/case/express-deposits"
import { bridgeRejectionCopy } from "@/lib/case/bridge-rejection"
import { officeStatusIsApproved, officeVerificationBadgeVariant } from "@/lib/case/status"
import type { OfficeBusinessRow, OfficeCaseChip } from "@/lib/case/types"
import { useOfficeCaseTab } from "@/lib/case/use-case-tab"
import { businessTypeDisplayText } from "@/lib/business-type-label"
import { formatOfficeTimestamp } from "@/lib/format-office-date"
import { WALLET_SEND_COMPLIANCE_STATUS_LABEL, verificationStatusLabel } from "@easner/shared"

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "kyb", label: "KYB" },
  { id: "banking", label: "Banking" },
  { id: "compliance", label: "Compliance" },
  { id: "team", label: "Team" },
  { id: "activity", label: "Activity" },
  { id: "pricing", label: "Pricing" },
] as const

function joinOfficeAddress(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ")
}

function BridgeRejectionSection({ reasons }: { reasons: unknown }) {
  const copy = bridgeRejectionCopy(reasons)
  if (!copy.customer && !copy.compliance) return null
  return (
    <OfficeSection title="Bridge rejection">
      {copy.customer ? <OfficeDetailRow label="Customer">{copy.customer}</OfficeDetailRow> : null}
      {copy.compliance ? <OfficeDetailRow label="Compliance">{copy.compliance}</OfficeDetailRow> : null}
    </OfficeSection>
  )
}

function ownerLabel(row: OfficeBusinessRow): string {
  if (row.owner_name?.trim()) return row.owner_name.trim()
  if (row.owner_email?.trim()) return row.owner_email.trim()
  return row.owner_user_id ? `${row.owner_user_id.slice(0, 8)}…` : "–"
}

export function prefetchOfficeBusinessCase(queryClient: QueryClient, businessId: string) {
  void queryClient.prefetchQuery({
    queryKey: officeKeys.kybPacket(businessId),
    queryFn: () => fetchOfficeKybPacket(businessId),
    staleTime: OFFICE_LIST_STALE_MS,
  })
  void queryClient.prefetchQuery({
    queryKey: officeKeys.subjectBanking("business", businessId),
    queryFn: () => fetchOfficeSubjectBanking("business", businessId),
    staleTime: OFFICE_LIST_STALE_MS,
  })
}

export function BusinessCase({ businessId }: { businessId: string }) {
  const queryClient = useQueryClient()
  const businessesQuery = useOfficeBusinesses()
  const usersQuery = useOfficeUsersDirectory()
  const rows = (businessesQuery.data ?? []) as OfficeBusinessRow[]
  const loading = useQueryInitialLoading(businessesQuery.isPending, businessesQuery.data, rows)
  const business = rows.find((row) => row.id === businessId) ?? null
  const tab = useOfficeCaseTab(
    TABS.map((t) => t.id),
    "profile",
  )

  const kybQuery = useOfficeKybPacket(businessId, tab.value === "kyb")
  const bankingQuery = useOfficeSubjectBanking(
    "business",
    businessId,
    tab.value === "banking" || tab.value === "compliance",
  )
  const membersQuery = useOfficeBusinessMembers(businessId, tab.value === "team")
  const txQuery = useOfficeBusinessTransactions(businessId, tab.value === "activity")
  const auditQuery = useOfficeSubjectAudit(businessId, tab.value === "compliance")
  const sendQuery = useOfficeSendCompliance(businessId, tab.value === "compliance")
  const txLoading = useQueryInitialLoading(txQuery.isPending, txQuery.data, txQuery.data ?? [])

  if (loading && !business) return <OfficePageSkeleton cards={0} />
  if (!business) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">This business is not in the directory.</p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href="/businesses">Back to businesses</Link>
        </Button>
      </div>
    )
  }

  const owner = usersQuery.data?.find((row) => row.id === business.owner_user_id) ?? null
  const expressStatus = expressDepositsOfficeStatus(owner?.stripe_express_deposits_status)
  const gridStatus = business.verification_status || "not_started"
  const bridgeStatus = business.bridge_kyc_status || "not_started"
  const accessUnlocked = officeStatusIsApproved(gridStatus) || officeStatusIsApproved(bridgeStatus)
  const chips: OfficeCaseChip[] = [
    { label: accessUnlocked ? "Unlocked" : "Locked", variant: accessUnlocked ? "emerald" : "slate" },
    {
      label: business.dev_platform_enabled ? "Dev Platform" : "Banking only",
      variant: business.dev_platform_enabled ? "emerald" : "outline",
    },
    {
      label: `Global · ${verificationStatusLabel(gridStatus, { detail: true })}`,
      variant: officeVerificationBadgeVariant(gridStatus),
    },
    {
      label: `More · ${verificationStatusLabel(bridgeStatus, { detail: true })}`,
      variant: officeVerificationBadgeVariant(bridgeStatus),
    },
    {
      label: `Express · ${verificationStatusLabel(expressStatus, { detail: true })}`,
      variant: officeVerificationBadgeVariant(expressStatus),
    },
  ]
  if (business.accountRestrictionPhase === "locked") chips.push({ label: "Closed", variant: "oxblood" })
  else if (business.accountRestrictionPhase === "wind_down") chips.push({ label: "Restricted", variant: "oxblood" })
  if (business.velocityLimitActive) {
    chips.push({ label: WALLET_SEND_COMPLIANCE_STATUS_LABEL, variant: "amber" })
  }

  function prefetchTab(id: string) {
    if (id === "kyb") {
      void queryClient.prefetchQuery({
        queryKey: officeKeys.kybPacket(businessId),
        queryFn: () => fetchOfficeKybPacket(businessId),
        staleTime: OFFICE_LIST_STALE_MS,
      })
    }
    if (id === "banking" || id === "compliance") {
      void queryClient.prefetchQuery({
        queryKey: officeKeys.subjectBanking("business", businessId),
        queryFn: () => fetchOfficeSubjectBanking("business", businessId),
        staleTime: OFFICE_LIST_STALE_MS,
      })
    }
    if (id === "team") {
      void queryClient.prefetchQuery({
        queryKey: officeKeys.businessMembers(businessId),
        queryFn: () => fetchOfficeBusinessMembers(businessId),
        staleTime: OFFICE_LIST_STALE_MS,
      })
    }
    if (id === "activity") {
      void queryClient.prefetchQuery({
        queryKey: officeKeys.businessTransactions(businessId),
        queryFn: () => fetchOfficeBusinessTransactions(businessId),
        staleTime: OFFICE_LIST_STALE_MS,
      })
    }
    if (id === "compliance") {
      void queryClient.prefetchQuery({
        queryKey: officeKeys.subjectAudit(businessId),
        queryFn: () => fetchOfficeSubjectAudit(businessId),
        staleTime: OFFICE_LIST_STALE_MS,
      })
    }
  }

  const easetag = business.easetag ?? business.slug
  const address = joinOfficeAddress([
    business.address_line1,
    business.address_line2,
    business.city,
    business.state,
    business.postal_code,
    business.country,
  ])
  const registeredAddress = joinOfficeAddress([
    business.registered_address_line1,
    business.registered_address_city,
    business.registered_address_state,
    business.registered_address_postal_code,
    business.registration_country || business.country,
  ])

  return (
    <Tabs value={tab.value} onValueChange={tab.onValueChange} className="-mx-4 -mt-6 sm:-mx-6 lg:-mx-8">
      <OfficeCaseHeader
        backHref="/businesses"
        backLabel="Businesses"
        avatarUrl={business.logo_url}
        avatarKind="logo"
        title={business.name?.trim() || "Business"}
        subtitle={easetag ? `@${easetag}` : undefined}
        chips={chips}
        ids={
          <>
            <OfficeCopyChip label="Grid" value={business.grid_customer_id} />
            <OfficeCopyChip label="Bridge" value={business.bridge_customer_id} />
          </>
        }
        actions={
          <div className="flex w-[min(22rem,100%)] flex-col items-stretch gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {business.owner_user_id ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/users/${business.owner_user_id}`}>Owner</Link>
                </Button>
              ) : null}
              <OfficeRestrictionControls
                compact
                kind="business"
                subjectId={business.id}
                phase={business.accountRestrictionPhase}
                source={business.accountRestrictionSource}
                windDownEndsAt={business.accountRestrictionWindDownEndsAt}
              />
            </div>
            <OfficeDevPlatformToggle
              businessId={business.id}
              enabled={Boolean(business.dev_platform_enabled)}
            />
          </div>
        }
        tabs={<OfficeCaseTabBar tabs={[...TABS]} onTabHover={prefetchTab} />}
      />
      <div className="px-6 pb-8 pt-5">
          <OfficeCaseTabPanel value="profile">
            <div className="grid gap-4 lg:grid-cols-2">
              <OfficeSection title="Business">
                <OfficeDetailRow label="Name">{business.name?.trim() || "–"}</OfficeDetailRow>
                <OfficeDetailRow label="Easetag">{easetag ? `@${easetag}` : "–"}</OfficeDetailRow>
                <OfficeDetailRow label="Type">{businessTypeDisplayText(business.business_type)}</OfficeDetailRow>
                <OfficeDetailRow label="Base currency">{business.base_currency?.trim() || "USD"}</OfficeDetailRow>
                <OfficeDetailRow label="Created">{formatOfficeTimestamp(business.created_at)}</OfficeDetailRow>
                <OfficeDetailRow label="Address">{address || "–"}</OfficeDetailRow>
                <OfficeDetailRow label="Owner">
                  {business.owner_user_id ? (
                    <Link
                      href={`/users/${business.owner_user_id}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {ownerLabel(business)}
                    </Link>
                  ) : (
                    "–"
                  )}
                </OfficeDetailRow>
              </OfficeSection>
              <OfficeSection title="Description">
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {business.description?.trim() ? business.description : "–"}
                </p>
              </OfficeSection>
              <OfficeSection title="Registration">
                <OfficeCopyValue label="Registration number" value={business.registration_number} />
                <OfficeCopyValue label="Tax ID" value={business.tax_id} />
                <OfficeDetailRow label="Registered address">{registeredAddress || "–"}</OfficeDetailRow>
                <OfficeDetailRow label="Registration country">
                  {business.registration_country?.trim() || business.country?.trim() || "–"}
                </OfficeDetailRow>
              </OfficeSection>
              <OfficeSection title="Contact">
                <OfficeDetailRow label="Website">
                  {business.website?.trim() ? (
                    <a
                      href={business.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {business.website}
                    </a>
                  ) : (
                    "–"
                  )}
                </OfficeDetailRow>
                <OfficeDetailRow label="Support email">{business.support_email?.trim() || "–"}</OfficeDetailRow>
                <OfficeDetailRow label="Support phone">{business.support_phone?.trim() || "–"}</OfficeDetailRow>
              </OfficeSection>
            </div>
            {owner ? (
              <div className="mt-4">
                <OfficeIdentityPanel user={owner} profileTitle="Owner" />
              </div>
            ) : null}
          </OfficeCaseTabPanel>
          <OfficeCaseTabPanel value="kyb">
            <div className="space-y-4">
              <BridgeRejectionSection
                reasons={business.bridge_kyc_rejection_reasons ?? business.verification_rejection_reasons}
              />
              <OfficeKybPacket
                businessId={business.id}
                packet={kybQuery.data}
                loading={kybQuery.isPending && !kybQuery.data}
                error={kybQuery.error instanceof Error ? kybQuery.error.message : null}
                onRetry={() => void kybQuery.refetch()}
                gridVerificationStatus={gridStatus}
                bridgeVerificationStatus={bridgeStatus}
                bridgeSync={
                  <OfficePartnerSync kind="business" subjectId={business.id} ownerUserId={business.owner_user_id} mode="bridge" />
                }
              />
              <OfficeExpressDepositsSection
                status={owner?.stripe_express_deposits_status}
                tier={owner?.stripe_express_kyc_tier}
                customerId={owner?.stripe_crypto_customer_id}
                ownerLabel={ownerLabel(business)}
              />
            </div>
          </OfficeCaseTabPanel>
          <OfficeCaseTabPanel value="banking">
            <OfficeBankingPanel
              kind="business"
              subjectId={business.id}
              banking={bankingQuery.data}
              loading={bankingQuery.isPending && !bankingQuery.data}
              error={bankingQuery.error instanceof Error ? bankingQuery.error.message : null}
              onRetry={() => void bankingQuery.refetch()}
              gridApproved={officeStatusIsApproved(gridStatus)}
              bridgeApproved={officeStatusIsApproved(bridgeStatus)}
              ownerUserId={business.owner_user_id}
            />
          </OfficeCaseTabPanel>
          <OfficeCaseTabPanel value="compliance">
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <OfficeSection title="Partner" description="Pull the latest status from the live rail." divide={false}>
                  <OfficePartnerSync
                    kind="business"
                    subjectId={business.id}
                    ownerUserId={business.owner_user_id}
                    virtualAccounts={bankingQuery.data?.virtualAccounts}
                  />
                </OfficeSection>
                {sendQuery.data ? (
                  <OfficeSection title="Send">
                    <OfficeDetailRow label="Platform">
                      {sendQuery.data.platformEnabled ? "On" : "Off"}
                    </OfficeDetailRow>
                    <OfficeDetailRow label="Velocity">
                      {sendQuery.data.velocityEnforced ? "Enforced" : "Not enforced"}
                    </OfficeDetailRow>
                  </OfficeSection>
                ) : (
                  <OfficeSection title="Send" divide={false}>
                    <p className="text-sm text-muted-foreground">Send compliance has not loaded yet.</p>
                  </OfficeSection>
                )}
              </div>
              <WalletSendComplianceOfficePanel
                businessId={business.id}
                velocityLimitActive={business.velocityLimitActive}
                velocityExpiresAt={business.velocityExpiresAt}
                velocityMaxSendUsd={business.velocityMaxSendUsd}
                velocitySentUsd={business.velocitySentUsd}
                velocityTriggerReason={business.velocityTriggerReason}
                velocityMode={business.velocityMode}
                onChanged={() => {
                  void queryClient.invalidateQueries({ queryKey: officeKeys.businesses() })
                }}
              />
              <OfficeSection title="Audit" divide={false}>
                <OfficeAuditPanel
                  entries={auditQuery.data ?? []}
                  loading={auditQuery.isPending && !auditQuery.data}
                  error={auditQuery.error instanceof Error ? auditQuery.error.message : null}
                />
              </OfficeSection>
            </div>
          </OfficeCaseTabPanel>
          <OfficeCaseTabPanel value="team">
            <OfficeTeamPanel
              members={membersQuery.data ?? []}
              loading={membersQuery.isPending && !membersQuery.data}
              error={membersQuery.error instanceof Error ? membersQuery.error.message : null}
            />
          </OfficeCaseTabPanel>
          <OfficeCaseTabPanel value="activity">
            <OfficeActivityPane
              transactions={txQuery.data ?? []}
              loading={txLoading}
              error={txQuery.error instanceof Error ? txQuery.error.message : null}
            />
          </OfficeCaseTabPanel>
          <OfficeCaseTabPanel value="pricing">
            <div className="space-y-6">
              <ProcessingFeeOverrideSection subjectType="business" subjectId={business.id} />
              <CheckoutFeeOverrideSection businessId={business.id} />
            </div>
          </OfficeCaseTabPanel>
      </div>
    </Tabs>
  )
}
