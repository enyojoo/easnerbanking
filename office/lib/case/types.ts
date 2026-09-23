import type { OfficeUserRow } from "@/hooks/queries"

export type OfficeBusinessRow = {
  id: string
  name: string | null
  easetag?: string | null
  slug?: string | null
  logo_url: string | null
  business_type: string | null
  base_currency: string | null
  description: string | null
  country?: string | null
  registration_number?: string | null
  tax_id?: string | null
  website?: string | null
  support_email?: string | null
  support_phone?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  registered_address_line1?: string | null
  registered_address_city?: string | null
  registered_address_state?: string | null
  registered_address_postal_code?: string | null
  registration_country?: string | null
  enabled_extra_account_currencies?: string[]
  grid_customer_id?: string | null
  verification_status?: string | null
  verification_provider?: string | null
  bridge_customer_id?: string | null
  bridge_kyc_status?: string | null
  bridge_kyc_rejection_reasons?: unknown
  verification_rejection_reasons?: unknown
  created_at: string
  updated_at?: string | null
  owner_user_id?: string | null
  owner_email?: string | null
  owner_name?: string | null
  accountRestrictionPhase?: "wind_down" | "locked" | null
  accountRestrictionWindDownEndsAt?: string | null
  accountRestrictionSource?: "grid" | "noah" | "office" | null
  velocityLimitActive?: boolean
  velocityExpiresAt?: string | null
  velocityMaxSendUsd?: number | null
  velocitySentUsd?: number | null
  velocityTriggerReason?: string | null
  velocityMode?: string | null
  dev_platform_enabled?: boolean | null
}

export type OfficeCaseChip = {
  label: string
  variant: "emerald" | "amber" | "oxblood" | "slate" | "outline"
}

export type OfficeIdentityUser = OfficeUserRow & {
  easetag?: string | null
  kyc_id_number?: string | null
  kyc_id_issuing_country?: string | null
  kyc_address_street?: string | null
  kyc_address_city?: string | null
  kyc_address_state?: string | null
  kyc_address_post_code?: string | null
  kyc_address_country?: string | null
  residence_country?: string | null
  bridge_cutover_required_at?: string | null
  bridge_cutover_deadline_at?: string | null
}

export type OfficeKybPerson = {
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
}

export type OfficeKybDocument = {
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
}

export type OfficeKybPacket = {
  applicationId: string | null
  status: string
  company: Record<string, unknown>
  people: OfficeKybPerson[]
  documents: OfficeKybDocument[]
  errors: unknown[]
  gridCustomerId: string | null
  submittedAt: string | null
  bridgeCustomerId: string | null
  bridgeKybStatus: string | null
}

export type OfficeVirtualAccount = {
  id: string
  provider: string
  currency: string
  status: string | null
  settlementTarget: string | null
  accountNumber: string | null
  routingNumber: string | null
  iban: string | null
  bic: string | null
  sortCode: string | null
  bankName: string | null
  accountHolderName: string | null
  providerVirtualAccountId: string | null
  providerCustomerId: string | null
}

export type OfficeBalance = {
  currency: string
  available: number
}

export type OfficeBankingPayload = {
  balances: OfficeBalance[]
  virtualAccounts: OfficeVirtualAccount[]
  extraCurrencies: string[]
}

export type OfficeTeamMember = {
  id: string
  membershipId?: string
  fullName: string
  email: string
  role: string
  status?: string
}

export type OfficeAuditEntry = {
  id: string
  action: string
  resource: string | null
  created_at: string
  metadata?: Record<string, unknown> | null
}
