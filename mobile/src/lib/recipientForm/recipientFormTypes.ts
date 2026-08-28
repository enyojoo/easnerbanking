export type RecipientFormType = 'wallet' | 'bank' | 'mobile' | 'easenet'

export type RecipientFormValues = {
  fullName: string
  accountNumber: string
  bankName: string
  currency: string
  routingNumber: string
  sortCode: string
  iban: string
  swiftBic: string
  phoneNumber: string
  provider: string
  walletAddress: string
  network: string
  checkingOrSavings: string
  addressLine1: string
  city: string
  state: string
  postalCode: string
  email: string
  payeeEasetag: string
  ycPixKeyType: string
  ycTaxId: string
  ycCuit: string
  ycIdentificationType: string
  ycIdentificationNumber: string
  ycAccountType: string
  ycIfsc: string
  ycBankCode: string
  ycBranchCode: string
  ycGridRegion: string
}

export type EasenetProfilePreview = {
  easetag: string
  fullName: string
  avatarUrl: string | null
  accountKind: 'business' | 'personal'
}

export function emptyRecipientFormValues(): RecipientFormValues {
  return {
    fullName: '',
    accountNumber: '',
    bankName: '',
    currency: 'USD',
    routingNumber: '',
    sortCode: '',
    iban: '',
    swiftBic: '',
    phoneNumber: '',
    provider: '',
    walletAddress: '',
    network: '',
    checkingOrSavings: '',
    addressLine1: '',
    city: '',
    state: '',
    postalCode: '',
    email: '',
    payeeEasetag: '',
    ycPixKeyType: '',
    ycTaxId: '',
    ycCuit: '',
    ycIdentificationType: '',
    ycIdentificationNumber: '',
    ycAccountType: '',
    ycIfsc: '',
    ycBankCode: '',
    ycBranchCode: '',
    ycGridRegion: '',
  }
}

export function recipientTypeKeyForForm(type: RecipientFormType | null): 'bank' | 'mobile_money' | 'wallet' {
  if (type === 'mobile') return 'mobile_money'
  if (type === 'easenet') return 'bank'
  return type || 'bank'
}

export function formatWalletBankLabel(currency: string, network: string): string {
  return `Wallet (${currency}/${network})`
}

export function formatMobileBankLabel(provider: string): string {
  return `Mobile Money (${provider})`
}
