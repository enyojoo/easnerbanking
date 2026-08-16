import { gridFetch } from "./http"
import { normalizeGridCustomerId } from "./quote-request"
import { gridBusinessCustomerUpdatePayload } from "./customer-update-payload"
import { gridAddressFromKybCompany, gridBusinessInfoFromKybCompany } from "./kyb-company-to-grid"
import type { GridKybCompanyDraft } from "@easner/shared"
import type { KybDocumentRow, KybPersonRow } from "./kyb-application-store"

export async function patchGridBusinessKybCustomer(input: {
  customerId: string
  company: GridKybCompanyDraft
  email?: string | null
}): Promise<void> {
  const businessInfo = gridBusinessInfoFromKybCompany(input.company)
  const address = gridAddressFromKybCompany(input.company)
  const patch: Record<string, unknown> = { businessInfo }
  if (address) patch.address = address
  if (input.email?.trim()) patch.email = input.email.trim()
  await gridFetch({
    method: "PATCH",
    path: `/customers/${encodeURIComponent(normalizeGridCustomerId(input.customerId))}`,
    json: gridBusinessCustomerUpdatePayload(patch),
  })
}

function ownerPersonalInfo(person: KybPersonRow): Record<string, unknown> {
  const addressCountry = person.addressCountry.trim().toUpperCase() || person.nationality.trim().toUpperCase()
  return {
    firstName: person.firstName.trim(),
    lastName: person.lastName.trim(),
    middleName: person.middleName.trim() || undefined,
    email: person.email.trim() || undefined,
    phoneNumber: person.phone.trim() || undefined,
    birthDate: person.birthDate.trim() || undefined,
    nationality: person.nationality.trim().toUpperCase() || undefined,
    identifier: person.identifier.trim() || undefined,
    idType: person.idType.trim() || undefined,
    countryOfIssuance: person.countryOfIssuance.trim().toUpperCase() || undefined,
    address: {
      line1: person.addressLine1.trim() || "Address on file",
      line2: person.addressLine2.trim() || undefined,
      city: person.city.trim() || undefined,
      state: person.state.trim() || undefined,
      postalCode: person.postalCode.trim() || "00000",
      country: addressCountry || "US",
    },
  }
}

export async function upsertGridBeneficialOwner(input: {
  customerId: string
  person: KybPersonRow
}): Promise<string> {
  const body = {
    customerId: normalizeGridCustomerId(input.customerId),
    ownershipPercentage: input.person.ownershipPercentage ?? 0,
    roles: input.person.roles.length ? input.person.roles : ["UBO"],
    personalInfo: ownerPersonalInfo(input.person),
  }
  if (input.person.gridBeneficialOwnerId) {
    const updated = await gridFetch<{ id?: string }>({
      method: "PATCH",
      path: `/beneficial-owners/${encodeURIComponent(input.person.gridBeneficialOwnerId)}`,
      json: {
        ownershipPercentage: body.ownershipPercentage,
        roles: body.roles,
        personalInfo: body.personalInfo,
      },
    })
    return String(updated.id ?? input.person.gridBeneficialOwnerId)
  }
  const created = await gridFetch<{ id: string }>({
    method: "POST",
    path: "/beneficial-owners",
    json: body,
  })
  return String(created.id)
}

export async function uploadGridKybDocument(input: {
  documentHolder: string
  document: KybDocumentRow
  bytes: Buffer
  fileName: string
}): Promise<string> {
  const form = new FormData()
  form.set("documentHolder", input.documentHolder)
  form.set("documentType", input.document.documentType || "OTHER")
  form.set("country", (input.document.issuingCountry || "US").toUpperCase())
  if (input.document.issuingAuthority) form.set("issuingAuthority", input.document.issuingAuthority)
  if (input.document.documentNumber) form.set("documentNumber", input.document.documentNumber)
  if (input.document.side) form.set("side", input.document.side)
  const blob = new Blob([new Uint8Array(input.bytes)], {
    type: input.document.contentType || "application/octet-stream",
  })
  form.set("file", blob, input.fileName || input.document.fileName || "document.pdf")
  const uploaded = await gridFetch<{ id: string }>({
    method: "POST",
    path: "/documents",
    formData: form,
  })
  return String(uploaded.id)
}

export async function deleteGridKybDocument(documentId: string): Promise<void> {
  await gridFetch({
    method: "DELETE",
    path: `/documents/${encodeURIComponent(documentId)}`,
  })
}

export async function submitGridKybVerification(customerId: string): Promise<{
  id: string
  verificationStatus: string
  errors: Array<Record<string, unknown>>
}> {
  const result = await gridFetch<{
    id?: string
    verificationStatus?: string
    errors?: Array<Record<string, unknown>>
  }>({
    method: "POST",
    path: "/verifications",
    json: { customerId: normalizeGridCustomerId(customerId) },
  })
  return {
    id: String(result.id ?? ""),
    verificationStatus: String(result.verificationStatus ?? ""),
    errors: Array.isArray(result.errors) ? result.errors : [],
  }
}
