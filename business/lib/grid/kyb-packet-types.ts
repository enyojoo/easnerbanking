import type { GridKybApplicationStatus, GridKybCompanyDraft, GridKybErrorPointer, GridKybVerificationError } from "@easner/shared"

export type KybPersonPacket = {
  id: string
  firstName: string
  middleName: string
  lastName: string
  email: string
  phone: string
  birthDate: string
  nationality: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  addressCountry: string
  ownershipPercentage: number | null
  roles: string[]
  idType: string
  identifier: string
  countryOfIssuance: string
  gridBeneficialOwnerId: string | null
}

export type KybDocumentPacket = {
  id: string
  personId: string | null
  category: string
  documentType: string
  issuingCountry: string
  issuingAuthority: string
  documentNumber: string
  fileName: string
  contentType: string
  byteSize: number | null
  side: string | null
  gridDocumentId: string | null
}

export type KybPacket = {
  applicationId: string
  status: GridKybApplicationStatus
  company: GridKybCompanyDraft
  people: KybPersonPacket[]
  documents: KybDocumentPacket[]
  errors: GridKybVerificationError[]
  errorPointers: GridKybErrorPointer[]
  gridCustomerId: string | null
  submittedAt: string | null
}
