export type GridKybFormSection = "company" | "people" | "documents"

export type GridKybSelectOption<T extends string = string> = {
  value: T
  label: string
  /** Extra terms so search finds local legal forms. Not sent to Grid. */
  aliases?: string
}

export const GRID_KYB_ENTITY_TYPES = [
  {
    value: "SOLE_PROPRIETORSHIP",
    label: "Sole trader / sole proprietorship",
    aliases: "sole proprietor individual enterprise self-employed freelancer EI EIRL empresario individual",
  },
  {
    value: "PARTNERSHIP",
    label: "Partnership / LLP",
    aliases: "general partnership limited partnership LP LLP GP OHG KG SENC SNC sociedade em nome coletivo",
  },
  {
    value: "LLC",
    label: "Private limited company (LLC, Ltd, GmbH)",
    aliases:
      "LLC Ltd Limited Pty Ltd GmbH SARL SRL BV Oy ApS Kft Sp z oo Ltda limitada private company limited by shares CC close corporation Pte Ltd SDN BHD",
  },
  {
    value: "CORPORATION",
    label: "Corporation / company limited by shares",
    aliases: "Inc Corp Corporation C-Corp AG SA NV NV PLC joint stock company sociedade anonima SpA KK Kabushiki",
  },
  {
    value: "S_CORPORATION",
    label: "S corporation (US tax election)",
    aliases: "S-Corp S corp United States",
  },
  {
    value: "NON_PROFIT",
    label: "Nonprofit / NGO / association",
    aliases: "non-profit not-for-profit NGO ASBL eV Verein association AISBL",
  },
  {
    value: "PUBLICLY_LISTED_COMPANY",
    label: "Publicly listed company",
    aliases: "public company listed PLC NYSE LSE publicly traded quoted",
  },
  {
    value: "TRUST",
    label: "Trust",
    aliases: "unit trust discretionary trust business trust",
  },
  {
    value: "PRIVATE_FOUNDATION",
    label: "Private foundation",
    aliases: "Stiftung fondation stichting foundation",
  },
  {
    value: "CHARITY",
    label: "Charity / charitable company",
    aliases: "CIC charitable incorporated organisation CIO registered charity",
  },
  { value: "OTHER", label: "Other", aliases: "cooperative coop co-op SCICA unlimited company UC" },
] as const satisfies readonly GridKybSelectOption[]

export const GRID_KYB_BUSINESS_TYPES = [
  { value: "AGRICULTURE_FORESTRY_FISHING_AND_HUNTING", label: "Agriculture, forestry, fishing and hunting" },
  { value: "MINING_QUARRYING_AND_OIL_AND_GAS_EXTRACTION", label: "Mining, quarrying, and oil and gas" },
  { value: "UTILITIES", label: "Utilities" },
  { value: "CONSTRUCTION", label: "Construction" },
  { value: "MANUFACTURING", label: "Manufacturing" },
  { value: "WHOLESALE_TRADE", label: "Wholesale trade" },
  { value: "RETAIL_TRADE", label: "Retail trade" },
  { value: "TRANSPORTATION_AND_WAREHOUSING", label: "Transportation and warehousing" },
  { value: "INFORMATION", label: "Information" },
  { value: "FINANCE_AND_INSURANCE", label: "Finance and insurance" },
  { value: "REAL_ESTATE_AND_RENTAL_AND_LEASING", label: "Real estate and rental" },
  { value: "PROFESSIONAL_SCIENTIFIC_AND_TECHNICAL_SERVICES", label: "Professional, scientific, and technical" },
  { value: "MANAGEMENT_OF_COMPANIES_AND_ENTERPRISES", label: "Management of companies" },
  {
    value: "ADMINISTRATIVE_AND_SUPPORT_AND_WASTE_MANAGEMENT_AND_REMEDIATION_SERVICES",
    label: "Administrative, support, and waste management",
  },
  { value: "EDUCATIONAL_SERVICES", label: "Educational services" },
  { value: "HEALTH_CARE_AND_SOCIAL_ASSISTANCE", label: "Health care and social assistance" },
  { value: "ARTS_ENTERTAINMENT_AND_RECREATION", label: "Arts, entertainment, and recreation" },
  { value: "ACCOMMODATION_AND_FOOD_SERVICES", label: "Accommodation and food services" },
  { value: "OTHER_SERVICES", label: "Other services" },
  { value: "PUBLIC_ADMINISTRATION", label: "Public administration" },
] as const satisfies readonly GridKybSelectOption[]

export const GRID_KYB_PURPOSE_OF_ACCOUNT = [
  { value: "CONTRACTOR_PAYOUTS", label: "Contractor payouts" },
  { value: "CREATOR_PAYOUTS", label: "Creator payouts" },
  { value: "EMPLOYEE_PAYOUTS", label: "Employee payouts" },
  { value: "MARKETPLACE_SELLER_PAYOUTS", label: "Marketplace seller payouts" },
  { value: "SUPPLIER_PAYMENTS", label: "Supplier payments" },
  { value: "CROSS_BORDER_B2B", label: "Cross-border B2B" },
  { value: "AR_AUTOMATION", label: "AR automation" },
  { value: "AP_AUTOMATION", label: "AP automation" },
  { value: "EMBEDDED_PAYMENTS", label: "Embedded payments" },
  { value: "PLATFORM_FEE_COLLECTION", label: "Platform fee collection" },
  { value: "P2P_TRANSFERS", label: "P2P transfers" },
  { value: "CHARITABLE_DONATIONS", label: "Charitable donations" },
  { value: "OTHER", label: "Other" },
] as const satisfies readonly GridKybSelectOption[]

export const GRID_KYB_MONTHLY_COUNT = [
  { value: "COUNT_UNDER_10", label: "Under 10" },
  { value: "COUNT_10_TO_100", label: "10–100" },
  { value: "COUNT_100_TO_500", label: "100–500" },
  { value: "COUNT_500_TO_1000", label: "500–1,000" },
  { value: "COUNT_OVER_1000", label: "Over 1,000" },
] as const satisfies readonly GridKybSelectOption[]

export const GRID_KYB_MONTHLY_VOLUME = [
  { value: "VOLUME_UNDER_10K", label: "Under $10k" },
  { value: "VOLUME_10K_TO_100K", label: "$10k–$100k" },
  { value: "VOLUME_100K_TO_1M", label: "$100k–$1M" },
  { value: "VOLUME_1M_TO_10M", label: "$1M–$10M" },
  { value: "VOLUME_OVER_10M", label: "Over $10M" },
] as const satisfies readonly GridKybSelectOption[]

export const GRID_KYB_OWNER_ROLES = [
  { value: "UBO", label: "Ultimate beneficial owner (UBO)" },
  { value: "CONTROL_PERSON", label: "Control person" },
  { value: "DIRECTOR", label: "Director" },
  { value: "COMPANY_OFFICER", label: "Company officer" },
  { value: "TRUSTEE", label: "Trustee" },
  { value: "GENERAL_PARTNER", label: "General partner" },
] as const satisfies readonly GridKybSelectOption[]

export const GRID_KYB_ID_TYPES = [
  { value: "SSN", label: "U.S. Social Security number (SSN)" },
  { value: "ITIN", label: "U.S. Individual Taxpayer Identification Number (ITIN)" },
  { value: "EIN", label: "U.S. Employer Identification Number (EIN)" },
  { value: "NON_US_TAX_ID", label: "Non-U.S. tax ID" },
] as const satisfies readonly GridKybSelectOption[]

export type GridKybSourceOfFundsId =
  | "revenue_from_operations"
  | "client_customer_payments"
  | "investor_shareholder_funding"
  | "owner_capital_contribution"
  | "loan_or_credit"
  | "sale_of_business_assets"
  | "grants_or_donations"
  | "other"

export type GridKybSourceOfFundsOption = {
  id: GridKybSourceOfFundsId
  label: string
  sourceOfFunds: string
  sourceOfFundsCategories: string[]
}

export const GRID_KYB_SOURCE_OF_FUNDS: readonly GridKybSourceOfFundsOption[] = [
  {
    id: "revenue_from_operations",
    label: "Revenue from operations",
    sourceOfFunds: "Revenue from operations",
    sourceOfFundsCategories: ["SELF_EMPLOYMENT_INCOME"],
  },
  {
    id: "client_customer_payments",
    label: "Client and customer payments",
    sourceOfFunds: "Client and customer payments",
    sourceOfFundsCategories: ["SELF_EMPLOYMENT_INCOME"],
  },
  {
    id: "investor_shareholder_funding",
    label: "Investor or shareholder funding",
    sourceOfFunds: "Investor or shareholder funding",
    sourceOfFundsCategories: ["INVESTMENT_INCOME"],
  },
  {
    id: "owner_capital_contribution",
    label: "Owner capital contribution",
    sourceOfFunds: "Owner capital contribution",
    sourceOfFundsCategories: ["SAVINGS"],
  },
  {
    id: "loan_or_credit",
    label: "Loan or credit",
    sourceOfFunds: "Loan or credit",
    sourceOfFundsCategories: ["LOAN"],
  },
  {
    id: "sale_of_business_assets",
    label: "Sale of business assets",
    sourceOfFunds: "Sale of business assets",
    sourceOfFundsCategories: ["SALE_OF_ASSETS"],
  },
  {
    id: "grants_or_donations",
    label: "Grants or donations",
    sourceOfFunds: "Grants or donations",
    sourceOfFundsCategories: ["GIFT"],
  },
  {
    id: "other",
    label: "Other",
    sourceOfFunds: "",
    sourceOfFundsCategories: ["OTHER"],
  },
]

export function resolveGridKybSourceOfFunds(input: {
  id: string
  otherDescription?: string | null
}): { sourceOfFunds: string; sourceOfFundsCategories: string[]; sourceOfFundsOtherDescription?: string } | null {
  const option = GRID_KYB_SOURCE_OF_FUNDS.find((row) => row.id === input.id)
  if (!option) return null
  if (option.id === "other") {
    const description = String(input.otherDescription ?? "").trim()
    return {
      sourceOfFunds: description,
      sourceOfFundsCategories: ["OTHER"],
      sourceOfFundsOtherDescription: description || undefined,
    }
  }
  return {
    sourceOfFunds: option.sourceOfFunds,
    sourceOfFundsCategories: [...option.sourceOfFundsCategories],
  }
}

export function sourceOfFundsIdFromStored(sourceOfFunds: string | null | undefined): GridKybSourceOfFundsId | "" {
  const raw = String(sourceOfFunds ?? "").trim()
  if (!raw) return ""
  const match = GRID_KYB_SOURCE_OF_FUNDS.find(
    (row) => row.id !== "other" && row.sourceOfFunds.toLowerCase() === raw.toLowerCase(),
  )
  return match?.id ?? "other"
}

export type GridKybDocumentCategory =
  | "legal_presence"
  | "control_structure"
  | "ownership_structure"
  | "proof_of_address"
  | "identity"
  | "good_standing"
  | "tax_id"

export const GRID_KYB_DOCUMENT_CATEGORIES: Record<
  GridKybDocumentCategory,
  { label: string; caption: string; acceptedDocumentTypes: string[] }
> = {
  legal_presence: {
    label: "Business registration",
    caption: "Upload a business registration document.",
    acceptedDocumentTypes: [
      "CERTIFICATE_OF_INCORPORATION",
      "ARTICLES_OF_INCORPORATION",
      "ARTICLES_OF_ASSOCIATION",
      "STATE_REGISTRY_EXCERPT",
    ],
  },
  control_structure: {
    label: "Control structure",
    caption: "Upload a control structure document.",
    acceptedDocumentTypes: [
      "DIRECTOR_REGISTRY",
      "TRUST_AGREEMENT",
      "STATE_COMPANY_REGISTRY",
      "PARTNERSHIP_CONTROL_AGREEMENT",
    ],
  },
  ownership_structure: {
    label: "Ownership structure",
    caption: "Upload an ownership structure document.",
    acceptedDocumentTypes: ["SHAREHOLDER_REGISTER", "TRUST_AGREEMENT", "PARTNERSHIP_AGREEMENT"],
  },
  proof_of_address: {
    label: "Proof of address",
    caption: "Upload proof of business address (last 3 months).",
    acceptedDocumentTypes: [
      "UTILITY_BILL",
      "RENT_OR_LEASE_AGREEMENT",
      "ELECTRICITY_BILL",
      "BANK_STATEMENT",
      "TAX_RETURN",
    ],
  },
  identity: {
    label: "Identity document",
    caption: "Upload an ID document for this owner.",
    acceptedDocumentTypes: ["PASSPORT", "DRIVERS_LICENSE", "NATIONAL_ID"],
  },
  good_standing: {
    label: "Good standing",
    caption: "Upload a good standing certificate.",
    acceptedDocumentTypes: ["GOOD_STANDING_CERTIFICATE"],
  },
  tax_id: {
    label: "Tax ID document",
    caption: "Upload a tax identification document.",
    acceptedDocumentTypes: ["TAX_RETURN", "INFORMATION_STATEMENT"],
  },
}

export const GRID_KYB_COMPANY_DOCUMENT_CATEGORIES: GridKybDocumentCategory[] = [
  "legal_presence",
  "control_structure",
  "ownership_structure",
  "proof_of_address",
]

export const GRID_KYB_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  PASSPORT: "Passport",
  DRIVERS_LICENSE: "Driver’s license",
  NATIONAL_ID: "National ID",
  CERTIFICATE_OF_INCORPORATION: "Certificate of incorporation",
  ARTICLES_OF_INCORPORATION: "Articles of incorporation",
  ARTICLES_OF_ASSOCIATION: "Articles of association",
  STATE_REGISTRY_EXCERPT: "State registry excerpt",
  DIRECTOR_REGISTRY: "Director registry",
  TRUST_AGREEMENT: "Trust agreement",
  STATE_COMPANY_REGISTRY: "State company registry",
  PARTNERSHIP_CONTROL_AGREEMENT: "Partnership control agreement",
  SHAREHOLDER_REGISTER: "Shareholder register",
  PARTNERSHIP_AGREEMENT: "Partnership agreement",
  UTILITY_BILL: "Utility bill",
  RENT_OR_LEASE_AGREEMENT: "Rent or lease agreement",
  ELECTRICITY_BILL: "Electricity bill",
  BANK_STATEMENT: "Bank statement",
  TAX_RETURN: "Tax return",
  GOOD_STANDING_CERTIFICATE: "Good standing certificate",
  INFORMATION_STATEMENT: "Information statement",
  SELFIE: "Selfie",
  OTHER: "Other",
}

export type GridKybVerificationError = {
  type?: string | null
  field?: string | null
  reason?: string | null
  resourceId?: string | null
  acceptedDocumentTypes?: string[] | null
}

export type GridKybErrorPointer = {
  section: GridKybFormSection
  field?: string
  documentCategory?: GridKybDocumentCategory
  resourceId?: string
  reason: string
  acceptedDocumentTypes?: string[]
}

const DOCUMENT_ERROR_TO_CATEGORY: Record<string, GridKybDocumentCategory> = {
  MISSING_LEGAL_PRESENCE_DOCUMENT: "legal_presence",
  MISSING_CONTROL_STRUCTURE_DOCUMENT: "control_structure",
  MISSING_OWNERSHIP_STRUCTURE_DOCUMENT: "ownership_structure",
  MISSING_PROOF_OF_ADDRESS_DOCUMENT: "proof_of_address",
  MISSING_IDENTITY_DOCUMENT: "identity",
  MISSING_GOOD_STANDING_DOCUMENT: "good_standing",
}

export function mapGridKybVerificationError(error: GridKybVerificationError): GridKybErrorPointer | null {
  const type = String(error.type ?? "").trim().toUpperCase()
  const reason = String(error.reason ?? "").trim() || "This item needs attention."
  const resourceId = String(error.resourceId ?? "").trim() || undefined
  const accepted = Array.isArray(error.acceptedDocumentTypes)
    ? error.acceptedDocumentTypes.map((row) => String(row).trim()).filter(Boolean)
    : undefined

  if (type === "MISSING_FIELD" || type === "INVALID_FIELD") {
    const field = String(error.field ?? "").trim()
    if (resourceId?.startsWith("BeneficialOwner:")) {
      return { section: "people", field: field || undefined, resourceId, reason }
    }
    return { section: "company", field: field || undefined, resourceId, reason }
  }

  const documentCategory = DOCUMENT_ERROR_TO_CATEGORY[type]
  if (documentCategory === "identity" || resourceId?.startsWith("BeneficialOwner:")) {
    return {
      section: "people",
      documentCategory: documentCategory ?? "identity",
      resourceId,
      reason,
      acceptedDocumentTypes: accepted,
    }
  }
  if (documentCategory) {
    return {
      section: "documents",
      documentCategory,
      resourceId,
      reason,
      acceptedDocumentTypes: accepted,
    }
  }

  if (type.startsWith("MISSING_") && type.endsWith("_DOCUMENT")) {
    return { section: "documents", resourceId, reason, acceptedDocumentTypes: accepted }
  }

  return { section: "company", resourceId, reason }
}

export function mapGridKybVerificationErrors(errors: GridKybVerificationError[] | null | undefined): GridKybErrorPointer[] {
  return (Array.isArray(errors) ? errors : [])
    .map(mapGridKybVerificationError)
    .filter((row): row is GridKybErrorPointer => Boolean(row))
}

export function firstGridKybErrorSection(errors: GridKybVerificationError[] | null | undefined): GridKybFormSection {
  return mapGridKybVerificationErrors(errors)[0]?.section ?? "company"
}

export type GridKybApplicationStatus =
  | "draft"
  | "submitted"
  | "resolve_errors"
  | "in_review"
  | "approved"
  | "rejected"
  | "hold"

export function gridKybApplicationStatusFromVerification(input: {
  verificationStatus?: string | null
  localStatus?: string | null
}): GridKybApplicationStatus {
  const verification = String(input.verificationStatus ?? "").trim().toUpperCase()
  const local = String(input.localStatus ?? "").trim().toLowerCase()
  if (local === "approved" || verification === "APPROVED") return "approved"
  if (local === "rejected" || verification === "REJECTED") return "rejected"
  if (local === "hold") return "hold"
  if (verification === "RESOLVE_ERRORS") return "resolve_errors"
  if (
    verification === "PENDING_MANUAL_REVIEW" ||
    verification === "IN_PROGRESS" ||
    local === "pending"
  ) {
    return "in_review"
  }
  if (verification === "READY_FOR_VERIFICATION" || local === "in_progress") return "submitted"
  return "draft"
}

export function gridKybApplicationIsEditable(status: string | null | undefined): boolean {
  const s = String(status ?? "").trim().toLowerCase()
  return s === "draft" || s === "resolve_errors" || s === "rejected" || s === "hold" || s === ""
}

export type GridKybCompanyDraft = {
  legalName: string
  doingBusinessAs: string
  registrationNumber: string
  taxId: string
  country: string
  incorporatedOn: string
  entityType: string
  businessType: string
  purposeOfAccount: string
  purposeOfAccountOtherDescription: string
  sourceOfFundsId: string
  sourceOfFundsOtherDescription: string
  expectedMonthlyTransactionCount: string
  expectedMonthlyTransactionVolume: string
  countriesOfOperation: string[]
  expectedRecipientJurisdictions: string[]
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  addressCountry: string
}

export function emptyGridKybCompanyDraft(): GridKybCompanyDraft {
  return {
    legalName: "",
    doingBusinessAs: "",
    registrationNumber: "",
    taxId: "",
    country: "",
    incorporatedOn: "",
    entityType: "",
    businessType: "",
    purposeOfAccount: "",
    purposeOfAccountOtherDescription: "",
    sourceOfFundsId: "",
    sourceOfFundsOtherDescription: "",
    expectedMonthlyTransactionCount: "",
    expectedMonthlyTransactionVolume: "",
    countriesOfOperation: [],
    expectedRecipientJurisdictions: [],
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    addressCountry: "",
  }
}
