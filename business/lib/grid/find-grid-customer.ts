import { gridFetch, gridFetchAllPages, GridHttpError } from "./http"
import { normalizeGridCustomerId } from "./quote-request"
import type { GridCustomer } from "./types"

export function isGridCustomerNotFoundError(error: unknown): boolean {
  if (!(error instanceof GridHttpError)) return false
  if (error.status === 404) return true
  const body = error.body
  if (!body || typeof body !== "object") return false
  return String((body as { code?: unknown }).code ?? "") === "CUSTOMER_NOT_FOUND"
}

export function parseGridCustomerListPayload(payload: unknown): GridCustomer[] {
  if (Array.isArray(payload)) return payload as GridCustomer[]
  if (!payload || typeof payload !== "object") return []
  const record = payload as { data?: unknown; customers?: unknown }
  if (Array.isArray(record.data)) return record.data as GridCustomer[]
  if (Array.isArray(record.customers)) return record.customers as GridCustomer[]
  return []
}

export function pickLatestGridCustomerForPlatformId(
  rows: GridCustomer[],
  platformCustomerId: string,
): GridCustomer | null {
  const wanted = platformCustomerId.trim()
  const matches = rows.filter((row) => {
    if (!row?.id) return false
    if (!wanted) return true
    const platformId = String(row.platformCustomerId ?? "").trim()
    return !platformId || platformId === wanted
  })
  if (matches.length === 0) return null
  return [...matches].sort((a, b) => String(b.id).localeCompare(String(a.id)))[0] ?? null
}

export async function findGridCustomerByPlatformId(
  platformCustomerId: string,
  options?: { includeDeleted?: boolean },
): Promise<GridCustomer | null> {
  const rows = await gridFetchAllPages<GridCustomer>({
    path: "/customers",
    query: {
      platformCustomerId,
      limit: 50,
      ...(options?.includeDeleted ? { isIncludingDeleted: "true" } : {}),
    },
    mapPage: (page) => parseGridCustomerListPayload(page),
  })
  const matched = pickLatestGridCustomerForPlatformId(rows, platformCustomerId)
  if (matched) return matched

  const fallback = await gridFetch<unknown>({
    method: "GET",
    path: `/customers?${new URLSearchParams({ limit: "50" }).toString()}`,
  })
  return pickLatestGridCustomerForPlatformId(
    parseGridCustomerListPayload(fallback),
    platformCustomerId,
  )
}

export function normalizeGridOrgName(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

function readGridCustomerEmail(row: GridCustomer): string {
  return String((row as GridCustomer & { email?: string }).email ?? "")
    .trim()
    .toLowerCase()
}

function readGridCustomerLegalName(row: GridCustomer): string {
  const info = (row as GridCustomer & { businessInfo?: { legalName?: string; tradeName?: string } })
    .businessInfo
  return String(info?.legalName ?? info?.tradeName ?? row.fullName ?? "")
}

function readGridCustomerRegistrationNumber(row: GridCustomer): string {
  const info = (row as GridCustomer & { businessInfo?: { registrationNumber?: string } }).businessInfo
  return String(info?.registrationNumber ?? "").replace(/\s/g, "")
}

function gridCustomerKybRank(row: GridCustomer): number {
  const raw = String(row.kybStatus ?? row.kycStatus ?? "")
    .trim()
    .toUpperCase()
  if (raw === "APPROVED") return 50
  if (raw === "PENDING") return 40
  if (raw === "HOLD") return 30
  if (raw === "REJECTED") return 10
  return 0
}

/** Attach an orphaned Grid BUSINESS customer created with a non-canonical platform id. */
export function pickGridBusinessCustomerForOrg(
  rows: GridCustomer[],
  input: { email?: string | null; legalName?: string | null; registrationNumber?: string | null },
): GridCustomer | null {
  const email = String(input.email ?? "").trim().toLowerCase()
  const name = normalizeGridOrgName(String(input.legalName ?? ""))
  const registration = String(input.registrationNumber ?? "").replace(/\s/g, "")
  if (!email && !name && !registration) return null

  const matches = rows.filter((row) => {
    if (!row?.id) return false
    const type = String(row.customerType ?? "BUSINESS").toUpperCase()
    if (type && type !== "BUSINESS") return false
    const rowName = normalizeGridOrgName(readGridCustomerLegalName(row))
    const rowEmail = readGridCustomerEmail(row)
    const rowReg = readGridCustomerRegistrationNumber(row)
    const nameOk = Boolean(name && rowName && (rowName === name || rowName.includes(name) || name.includes(rowName)))
    const emailOk = Boolean(email && rowEmail && rowEmail === email)
    const regOk = Boolean(registration && rowReg && rowReg === registration)
    if (nameOk || regOk) return true
    return emailOk && !rowName
  })
  if (matches.length === 0) return null
  return [...matches].sort((a, b) => {
    const byRank = gridCustomerKybRank(b) - gridCustomerKybRank(a)
    if (byRank !== 0) return byRank
    return String(b.id).localeCompare(String(a.id))
  })[0] ?? null
}

export async function findGridBusinessCustomerForOrg(input: {
  email?: string | null
  legalName?: string | null
  registrationNumber?: string | null
}): Promise<GridCustomer | null> {
  const rows = await gridFetchAllPages<GridCustomer>({
    path: "/customers",
    query: { customerType: "BUSINESS", limit: 50 },
    mapPage: (page) => parseGridCustomerListPayload(page),
  })
  return pickGridBusinessCustomerForOrg(rows, input)
}

export async function requireExistingGridCustomer(customerId: string): Promise<GridCustomer | null> {
  const id = normalizeGridCustomerId(customerId)
  if (!id) return null
  try {
    return await gridFetch<GridCustomer>({
      method: "GET",
      path: `/customers/${encodeURIComponent(id)}`,
    })
  } catch (e) {
    if (isGridCustomerNotFoundError(e)) return null
    throw e
  }
}
