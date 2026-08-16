import { resolveGridKybSourceOfFunds, type GridKybCompanyDraft } from "@easner/shared"

export function gridBusinessInfoFromKybCompany(company: GridKybCompanyDraft): Record<string, unknown> {
  const source = resolveGridKybSourceOfFunds({
    id: company.sourceOfFundsId,
    otherDescription: company.sourceOfFundsOtherDescription,
  })
  const businessInfo: Record<string, unknown> = {}
  const legalName = company.legalName.trim()
  if (legalName) businessInfo.legalName = legalName
  if (company.doingBusinessAs.trim()) businessInfo.doingBusinessAs = company.doingBusinessAs.trim()
  if (company.registrationNumber.trim()) businessInfo.registrationNumber = company.registrationNumber.trim()
  if (company.taxId.trim()) businessInfo.taxId = company.taxId.trim()
  if (company.country.trim()) businessInfo.country = company.country.trim().toUpperCase()
  if (company.incorporatedOn.trim()) businessInfo.incorporatedOn = company.incorporatedOn.trim()
  if (company.entityType.trim()) businessInfo.entityType = company.entityType.trim()
  if (company.businessType.trim()) businessInfo.businessType = company.businessType.trim()
  if (company.purposeOfAccount.trim()) businessInfo.purposeOfAccount = company.purposeOfAccount.trim()
  if (company.purposeOfAccount === "OTHER" && company.purposeOfAccountOtherDescription.trim()) {
    businessInfo.purposeOfAccountOtherDescription = company.purposeOfAccountOtherDescription.trim()
  }
  if (source?.sourceOfFunds) businessInfo.sourceOfFunds = source.sourceOfFunds
  if (source?.sourceOfFundsCategories?.length) {
    businessInfo.sourceOfFundsCategories = source.sourceOfFundsCategories
  }
  if (source?.sourceOfFundsOtherDescription) {
    businessInfo.sourceOfFundsOtherDescription = source.sourceOfFundsOtherDescription
  }
  if (company.expectedMonthlyTransactionCount.trim()) {
    businessInfo.expectedMonthlyTransactionCount = company.expectedMonthlyTransactionCount.trim()
  }
  if (company.expectedMonthlyTransactionVolume.trim()) {
    businessInfo.expectedMonthlyTransactionVolume = company.expectedMonthlyTransactionVolume.trim()
  }
  if (company.countriesOfOperation.length) {
    businessInfo.countriesOfOperation = company.countriesOfOperation.map((row) => row.toUpperCase())
  }
  if (company.expectedRecipientJurisdictions.length) {
    businessInfo.expectedRecipientJurisdictions = company.expectedRecipientJurisdictions.map((row) =>
      row.toUpperCase(),
    )
  }
  return businessInfo
}

export function gridAddressFromKybCompany(company: GridKybCompanyDraft): Record<string, unknown> | null {
  const line1 = company.addressLine1.trim()
  const country = company.addressCountry.trim().toUpperCase() || company.country.trim().toUpperCase()
  const postalCode = company.postalCode.trim()
  if (!line1 || !country || !postalCode) return null
  return {
    line1,
    line2: company.addressLine2.trim() || undefined,
    city: company.city.trim() || undefined,
    state: company.state.trim() || undefined,
    postalCode,
    country,
  }
}
