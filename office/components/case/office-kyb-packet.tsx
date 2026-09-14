"use client"

import { useState, type ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { OfficeCopyValue } from "./office-copy-value"
import { OfficeDetailRow, OfficeSection } from "./office-detail-grid"
import { OfficeDocPreview } from "./office-doc-preview"
import { displayText, officeVerificationBadgeVariant } from "@/lib/case/status"
import type { OfficeKybDocument, OfficeKybPacket, OfficeKybPerson } from "@/lib/case/types"
import { formatOfficeDate } from "@/lib/format-office-date"
import {
  GRID_KYB_BUSINESS_TYPES,
  GRID_KYB_DOCUMENT_TYPE_LABELS,
  GRID_KYB_ENTITY_TYPES,
  GRID_KYB_PURPOSE_OF_ACCOUNT,
  GRID_KYB_SOURCE_OF_FUNDS,
  verificationStatusLabel,
} from "@easner/shared"

function optionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
): string {
  const raw = String(value ?? "").trim()
  if (!raw) return "–"
  return options.find((row) => row.value === raw)?.label || raw
}

function companyText(company: Record<string, unknown>, key: string): string {
  return displayText(typeof company[key] === "string" ? (company[key] as string) : null)
}

function personName(person: OfficeKybPerson): string {
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ").trim() || "–"
}

export function OfficeKybPacket({
  businessId,
  packet,
  loading,
  error,
  onRetry,
  gridVerificationStatus,
  bridgeVerificationStatus,
  bridgeSync,
}: {
  businessId: string
  packet: OfficeKybPacket | undefined
  loading: boolean
  error?: string | null
  onRetry?: () => void
  gridVerificationStatus?: string | null
  bridgeVerificationStatus?: string | null
  bridgeSync?: ReactNode
}) {
  const [preview, setPreview] = useState<OfficeKybDocument | null>(null)
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-destructive">{error}</p>
        {onRetry ? (
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    )
  }
  if (!packet) return null

  const company = packet.company ?? {}
  const gridStatus = gridVerificationStatus || (packet.applicationId ? packet.status : "not_started")
  const bridgeStatus = bridgeVerificationStatus || packet.bridgeKybStatus || "not_started"
  const address = [
    company.addressLine1,
    company.addressLine2,
    company.city,
    company.state,
    company.postalCode,
    company.addressCountry,
  ]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(", ")
  const sourceLabel =
    GRID_KYB_SOURCE_OF_FUNDS.find((row) => row.id === String(company.sourceOfFundsId ?? ""))?.label ||
    displayText(typeof company.sourceOfFundsId === "string" ? company.sourceOfFundsId : null)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <OfficeSection
          title="Global banking"
          description="Grid packet and documents"
          action={
            <Badge variant={officeVerificationBadgeVariant(gridStatus)}>
              {verificationStatusLabel(gridStatus, { detail: true })}
            </Badge>
          }
        >
          {!packet.applicationId ? (
            <p className="text-sm text-muted-foreground">No Grid packet on file.</p>
          ) : (
            <>
              <OfficeCopyValue label="Grid · customer" value={packet.gridCustomerId} />
              {packet.submittedAt ? (
                <OfficeDetailRow label="Submitted">{formatOfficeDate(packet.submittedAt)}</OfficeDetailRow>
              ) : null}
            </>
          )}
        </OfficeSection>
        <OfficeSection
          title="More accounts"
          description="Bridge hosted KYB · no local documents"
          divide={false}
          action={
            <Badge variant={officeVerificationBadgeVariant(bridgeStatus)}>
              {verificationStatusLabel(bridgeStatus, { detail: true })}
            </Badge>
          }
        >
          {packet.bridgeCustomerId ? (
            <OfficeCopyValue label="Bridge · customer" value={packet.bridgeCustomerId} />
          ) : (
            <p className="text-sm text-muted-foreground">More accounts not started.</p>
          )}
          {bridgeSync}
        </OfficeSection>
      </div>

      {packet.applicationId ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <OfficeSection title="Company">
              <OfficeDetailRow label="Legal name">{companyText(company, "legalName")}</OfficeDetailRow>
              <OfficeDetailRow label="Doing business as">{companyText(company, "doingBusinessAs")}</OfficeDetailRow>
              <OfficeDetailRow label="Entity type">
                {optionLabel(
                  GRID_KYB_ENTITY_TYPES,
                  companyText(company, "entityType") === "–" ? "" : String(company.entityType ?? ""),
                )}
              </OfficeDetailRow>
              <OfficeDetailRow label="Business type">
                {optionLabel(GRID_KYB_BUSINESS_TYPES, String(company.businessType ?? ""))}
              </OfficeDetailRow>
              <OfficeDetailRow label="Registration" mono>
                {companyText(company, "registrationNumber")}
              </OfficeDetailRow>
              <OfficeDetailRow label="Tax ID" mono>
                {companyText(company, "taxId")}
              </OfficeDetailRow>
              <OfficeDetailRow label="Country">{companyText(company, "country")}</OfficeDetailRow>
              <OfficeDetailRow label="Incorporated">
                {company.incorporatedOn ? formatOfficeDate(String(company.incorporatedOn)) : "–"}
              </OfficeDetailRow>
              <OfficeDetailRow label="Address">{address || "–"}</OfficeDetailRow>
              <OfficeDetailRow label="Purpose">
                {optionLabel(GRID_KYB_PURPOSE_OF_ACCOUNT, String(company.purposeOfAccount ?? ""))}
              </OfficeDetailRow>
              <OfficeDetailRow label="Source of funds">{sourceLabel}</OfficeDetailRow>
            </OfficeSection>
            <OfficeSection title="People" divide={false}>
              {packet.people.length === 0 ? (
                <p className="text-sm text-muted-foreground">No owners or control people on file.</p>
              ) : (
                packet.people.map((person) => (
                  <div key={person.id} className="rounded-2xl bg-muted/40 p-3">
                    <p className="text-sm font-medium text-foreground">{personName(person)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {(person.roles.length ? person.roles.join(", ") : "No role")}
                      {person.ownershipPercentage == null ? "" : ` · ${person.ownershipPercentage}%`}
                    </p>
                    <div className="mt-2 divide-y divide-border/60">
                      <OfficeDetailRow label="Email">{displayText(person.email)}</OfficeDetailRow>
                      <OfficeDetailRow label="ID type">{displayText(person.idType)}</OfficeDetailRow>
                      <OfficeDetailRow label="ID number" mono>
                        {displayText(person.identifier)}
                      </OfficeDetailRow>
                    </div>
                  </div>
                ))
              )}
            </OfficeSection>
          </div>
          <OfficeSection title="Documents" divide={false}>
            {packet.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents uploaded.</p>
            ) : (
              packet.documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{doc.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {GRID_KYB_DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType}
                      {doc.category ? ` · ${doc.category}` : ""}
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => setPreview(doc)}>
                    Preview
                  </Button>
                </div>
              ))
            )}
          </OfficeSection>
        </>
      ) : null}

      <OfficeDocPreview businessId={businessId} document={preview} onClose={() => setPreview(null)} />
    </div>
  )
}
