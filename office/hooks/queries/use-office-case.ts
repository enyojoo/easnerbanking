"use client"

import { useQuery } from "@tanstack/react-query"
import { officeFetch } from "@/lib/api-client"
import { officeKeys } from "@/lib/query/keys"
import { officeOperationalQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"
import type {
  OfficeAuditEntry,
  OfficeBankingPayload,
  OfficeKybPacket,
  OfficeTeamMember,
} from "@/lib/case/types"
import type { OfficeTransaction } from "@/lib/types/office-transaction"

export async function fetchOfficeKybPacket(businessId: string): Promise<OfficeKybPacket> {
  const r = await officeFetch(`/api/admin/office/businesses/${encodeURIComponent(businessId)}/kyb-packet`)
  const body = (await r.json()) as OfficeKybPacket & { error?: string }
  if (!r.ok) throw new Error(body.error || "Failed to load KYB packet")
  return body
}

export function useOfficeKybPacket(businessId: string | null, enabled: boolean) {
  const { enabled: adminEnabled } = useOfficeAdminEnabled()
  return useQuery({
    queryKey: officeKeys.kybPacket(businessId ?? ""),
    enabled: adminEnabled && enabled && Boolean(businessId),
    ...officeOperationalQueryDefaults,
    queryFn: () => fetchOfficeKybPacket(String(businessId)),
  })
}

export async function fetchOfficeSubjectBanking(
  kind: "user" | "business",
  id: string,
): Promise<OfficeBankingPayload> {
  const r = await officeFetch(`/api/admin/office/subjects/${kind}/${encodeURIComponent(id)}/banking`)
  const body = (await r.json()) as OfficeBankingPayload & { error?: string }
  if (!r.ok) throw new Error(body.error || "Failed to load banking")
  return body
}

export function useOfficeSubjectBanking(kind: "user" | "business", id: string | null, enabled: boolean) {
  const { enabled: adminEnabled } = useOfficeAdminEnabled()
  return useQuery({
    queryKey: officeKeys.subjectBanking(kind, id ?? ""),
    enabled: adminEnabled && enabled && Boolean(id),
    ...officeOperationalQueryDefaults,
    queryFn: () => fetchOfficeSubjectBanking(kind, String(id)),
  })
}

export async function fetchOfficeBusinessMembers(businessId: string): Promise<OfficeTeamMember[]> {
  const r = await officeFetch(`/api/admin/office/businesses/${encodeURIComponent(businessId)}/members`)
  const body = (await r.json()) as { members?: OfficeTeamMember[]; error?: string }
  if (!r.ok) throw new Error(body.error || "Failed to load team")
  return body.members ?? []
}

export function useOfficeBusinessMembers(businessId: string | null, enabled: boolean) {
  const { enabled: adminEnabled } = useOfficeAdminEnabled()
  return useQuery({
    queryKey: officeKeys.businessMembers(businessId ?? ""),
    enabled: adminEnabled && enabled && Boolean(businessId),
    ...officeOperationalQueryDefaults,
    queryFn: () => fetchOfficeBusinessMembers(String(businessId)),
  })
}

export async function fetchOfficeSubjectAudit(subjectId: string): Promise<OfficeAuditEntry[]> {
  const r = await officeFetch(
    `/api/admin/audit-log?subjectId=${encodeURIComponent(subjectId)}&limit=50`,
  )
  const body = (await r.json()) as { entries?: OfficeAuditEntry[]; error?: string }
  if (!r.ok) throw new Error(body.error || "Failed to load audit")
  return body.entries ?? []
}

export function useOfficeSubjectAudit(subjectId: string | null, enabled: boolean) {
  const { enabled: adminEnabled } = useOfficeAdminEnabled()
  return useQuery({
    queryKey: officeKeys.subjectAudit(subjectId ?? ""),
    enabled: adminEnabled && enabled && Boolean(subjectId),
    ...officeOperationalQueryDefaults,
    queryFn: () => fetchOfficeSubjectAudit(String(subjectId)),
  })
}

export async function fetchOfficeSendCompliance(businessId: string): Promise<Record<string, unknown>> {
  const r = await officeFetch(
    `/api/admin/office/businesses/${encodeURIComponent(businessId)}/send-compliance`,
  )
  const body = (await r.json()) as Record<string, unknown> & { error?: string }
  if (!r.ok) throw new Error(body.error || "Failed to load send compliance")
  return body
}

export function useOfficeSendCompliance(businessId: string | null, enabled: boolean) {
  const { enabled: adminEnabled } = useOfficeAdminEnabled()
  return useQuery({
    queryKey: officeKeys.sendCompliance(businessId ?? ""),
    enabled: adminEnabled && enabled && Boolean(businessId),
    ...officeOperationalQueryDefaults,
    queryFn: () => fetchOfficeSendCompliance(String(businessId)),
  })
}

export async function fetchOfficeBusinessTransactions(businessId: string): Promise<OfficeTransaction[]> {
  const r = await officeFetch(
    `/api/admin/office/transactions?businessId=${encodeURIComponent(businessId)}&limit=100`,
  )
  const body = (await r.json()) as { transactions?: OfficeTransaction[]; error?: string }
  if (!r.ok || body.error) throw new Error(body.error || r.statusText)
  return body.transactions ?? []
}

export function useOfficeBusinessTransactions(businessId: string | null, enabled: boolean) {
  const { enabled: adminEnabled } = useOfficeAdminEnabled()
  return useQuery({
    queryKey: officeKeys.businessTransactions(businessId ?? ""),
    enabled: adminEnabled && enabled && Boolean(businessId),
    ...officeOperationalQueryDefaults,
    queryFn: () => fetchOfficeBusinessTransactions(String(businessId)),
  })
}
