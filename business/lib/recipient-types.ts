export interface Beneficiary {
  id: string
  countryCode?: string
  name: string
  bankName: string
  accountNumber: string
  fullAccountNumber: string
  routingNumber?: string
  iban?: string
  bic?: string
  sortCode?: string
  country: string
  currency: string
  email: string
  phone: string
  transferType?: "ACH" | "Wire"
  checkingOrSavings?: "checking" | "savings"
  addressLine1?: string
  mobileProvider?: string
  walletAsset?: string
  walletNetwork?: string
  walletMemoTag?: string
  createdAt: string
  lastUsed: string
}
