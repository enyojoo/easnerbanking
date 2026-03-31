export type RecipientType = 'bank' | 'mobile_money' | 'wallet'
export type RailStatus = 'supported' | 'coming_soon'

export type RecipientFieldKey =
  | 'fullName'
  | 'bankName'
  | 'accountNumber'
  | 'routingNumber'
  | 'sortCode'
  | 'iban'
  | 'swiftBic'
  | 'phoneNumber'
  | 'provider'
  | 'walletAddress'
  | 'network'
  | 'memoTag'

export interface RecipientFieldSpec {
  key: RecipientFieldKey
  label: string
  placeholder: string
  required: boolean
  keyboardType?: 'default' | 'number-pad' | 'phone-pad'
}

export interface RecipientCatalogEntry {
  countryCode: string
  countryName: string
  currencyCode: string
  currencyName: string
  recipientType: RecipientType
  status: RailStatus
  providers?: string[]
  fields: RecipientFieldSpec[]
}

/** Noah payout network names (docs.noah.com/products/global-payouts-api). EURC/SOL → Solana; BTC → Bitcoin. */
export const walletAssetNetworkMap: Record<string, string[]> = {
  USDT: ['Base', 'Bitcoin', 'Celo', 'Ethereum'],
  USDC: ['Base', 'Bitcoin', 'Celo', 'Ethereum', 'FlowEvm', 'Gnosis', 'Lightning'],
  EURC: ['Solana'],
  BTC: ['Bitcoin'],
  SOL: ['Solana'],
  PYUSD: ['Base', 'Bitcoin'],
}

const bankDefaultFields: RecipientFieldSpec[] = [
  { key: 'fullName', label: 'Account name', placeholder: 'Account name', required: true },
  { key: 'bankName', label: 'Bank name', placeholder: 'Bank name', required: true },
  { key: 'accountNumber', label: 'Account number', placeholder: 'Account number', required: true, keyboardType: 'number-pad' },
]

const mobileMoneyFields: RecipientFieldSpec[] = [
  { key: 'fullName', label: 'Account name', placeholder: 'Account name', required: true },
  { key: 'provider', label: 'Network', placeholder: 'Select network', required: true },
  { key: 'phoneNumber', label: 'Phone number', placeholder: '+2348012345678', required: true, keyboardType: 'phone-pad' },
]

const walletFields: RecipientFieldSpec[] = [
  { key: 'fullName', label: 'Wallet owner name', placeholder: 'Wallet owner name', required: true },
  { key: 'network', label: 'Network', placeholder: 'Select network', required: true },
  { key: 'walletAddress', label: 'Wallet address', placeholder: 'Wallet address', required: true },
  { key: 'memoTag', label: 'Memo/Tag (optional)', placeholder: 'Memo, tag, or destination tag', required: false },
]

const noahBankCountryCurrencies: Array<{ countryCode: string; countryName: string; currencyCode: string; currencyName: string }> = [
  { countryCode: 'US', countryName: 'United States', currencyCode: 'USD', currencyName: 'US Dollar' },
  { countryCode: 'AR', countryName: 'Argentina', currencyCode: 'ARS', currencyName: 'Argentine Peso' },
  { countryCode: 'AU', countryName: 'Australia', currencyCode: 'AUD', currencyName: 'Australian Dollar' },
  { countryCode: 'AT', countryName: 'Austria', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'BE', countryName: 'Belgium', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'BJ', countryName: 'Benin', currencyCode: 'XOF', currencyName: 'West African CFA Franc' },
  { countryCode: 'BR', countryName: 'Brazil', currencyCode: 'BRL', currencyName: 'Brazilian Real' },
  { countryCode: 'CH', countryName: 'Switzerland', currencyCode: 'CHF', currencyName: 'Swiss Franc' },
  { countryCode: 'CL', countryName: 'Chile', currencyCode: 'CLP', currencyName: 'Chilean Peso' },
  { countryCode: 'CO', countryName: 'Colombia', currencyCode: 'COP', currencyName: 'Colombian Peso' },
  { countryCode: 'CG', countryName: 'Republic of the Congo', currencyCode: 'XAF', currencyName: 'Central African CFA Franc' },
  { countryCode: 'CI', countryName: "Cote D'Ivoire", currencyCode: 'XOF', currencyName: 'West African CFA Franc' },
  { countryCode: 'HR', countryName: 'Croatia', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'CZ', countryName: 'Czech Republic', currencyCode: 'CZK', currencyName: 'Czech Koruna' },
  { countryCode: 'DK', countryName: 'Denmark', currencyCode: 'DKK', currencyName: 'Danish Krone' },
  { countryCode: 'DO', countryName: 'Dominican Republic', currencyCode: 'DOP', currencyName: 'Dominican Peso' },
  { countryCode: 'EC', countryName: 'Ecuador', currencyCode: 'USD', currencyName: 'US Dollar' },
  { countryCode: 'EE', countryName: 'Estonia', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'ET', countryName: 'Ethiopia', currencyCode: 'ETB', currencyName: 'Ethiopian Birr' },
  { countryCode: 'FI', countryName: 'Finland', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'FJ', countryName: 'Fiji', currencyCode: 'FJD', currencyName: 'Fijian Dollar' },
  { countryCode: 'FR', countryName: 'France', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'GA', countryName: 'Gabon', currencyCode: 'XAF', currencyName: 'Central African CFA Franc' },
  { countryCode: 'DE', countryName: 'Germany', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'GH', countryName: 'Ghana', currencyCode: 'GHS', currencyName: 'Ghanaian Cedi' },
  { countryCode: 'GR', countryName: 'Greece', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'HK', countryName: 'Hong Kong', currencyCode: 'HKD', currencyName: 'Hong Kong Dollar' },
  { countryCode: 'IN', countryName: 'India', currencyCode: 'INR', currencyName: 'Indian Rupee' },
  { countryCode: 'ID', countryName: 'Indonesia', currencyCode: 'IDR', currencyName: 'Indonesian Rupiah' },
  { countryCode: 'IE', countryName: 'Ireland', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'IT', countryName: 'Italy', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'LV', countryName: 'Latvia', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'LT', countryName: 'Lithuania', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'LU', countryName: 'Luxembourg', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'MW', countryName: 'Malawi', currencyCode: 'MWK', currencyName: 'Malawian Kwacha' },
  { countryCode: 'MY', countryName: 'Malaysia', currencyCode: 'MYR', currencyName: 'Malaysian Ringgit' },
  { countryCode: 'MX', countryName: 'Mexico', currencyCode: 'MXN', currencyName: 'Mexican Peso' },
  { countryCode: 'NL', countryName: 'Netherlands', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'NZ', countryName: 'New Zealand', currencyCode: 'NZD', currencyName: 'New Zealand Dollar' },
  { countryCode: 'NG', countryName: 'Nigeria', currencyCode: 'NGN', currencyName: 'Nigerian Naira' },
  { countryCode: 'PH', countryName: 'Philippines', currencyCode: 'PHP', currencyName: 'Philippine Peso' },
  { countryCode: 'PL', countryName: 'Poland', currencyCode: 'PLN', currencyName: 'Polish Zloty' },
  { countryCode: 'PT', countryName: 'Portugal', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'PY', countryName: 'Paraguay', currencyCode: 'PYG', currencyName: 'Paraguayan Guarani' },
  { countryCode: 'RO', countryName: 'Romania', currencyCode: 'RON', currencyName: 'Romanian Leu' },
  { countryCode: 'RW', countryName: 'Rwanda', currencyCode: 'RWF', currencyName: 'Rwandan Franc' },
  { countryCode: 'SG', countryName: 'Singapore', currencyCode: 'SGD', currencyName: 'Singapore Dollar' },
  { countryCode: 'SL', countryName: 'Sierra Leone', currencyCode: 'SLL', currencyName: 'Sierra Leonean Leone' },
  { countryCode: 'SK', countryName: 'Slovakia', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'SI', countryName: 'Slovenia', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'KR', countryName: 'South Korea', currencyCode: 'KRW', currencyName: 'South Korean Won' },
  { countryCode: 'ES', countryName: 'Spain', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'SE', countryName: 'Sweden', currencyCode: 'SEK', currencyName: 'Swedish Krona' },
  { countryCode: 'TH', countryName: 'Thailand', currencyCode: 'THB', currencyName: 'Thai Baht' },
  { countryCode: 'TR', countryName: 'Turkey', currencyCode: 'TRY', currencyName: 'Turkish Lira' },
  { countryCode: 'AE', countryName: 'United Arab Emirates', currencyCode: 'AED', currencyName: 'UAE Dirham' },
  { countryCode: 'GB', countryName: 'United Kingdom', currencyCode: 'GBP', currencyName: 'British Pound' },
  { countryCode: 'UG', countryName: 'Uganda', currencyCode: 'UGX', currencyName: 'Ugandan Shilling' },
  { countryCode: 'UY', countryName: 'Uruguay', currencyCode: 'UYU', currencyName: 'Uruguayan Peso' },
  { countryCode: 'VU', countryName: 'Vanuatu', currencyCode: 'VUV', currencyName: 'Vanuatu Vatu' },
]

function getBankFieldsForCurrency(currencyCode: string): RecipientFieldSpec[] {
  if (currencyCode === 'USD') {
    return [
      { key: 'fullName', label: 'Account name', placeholder: 'Account name', required: true },
      { key: 'bankName', label: 'Bank name', placeholder: 'Bank name', required: true },
      { key: 'routingNumber', label: 'Routing number', placeholder: 'Routing number', required: true, keyboardType: 'number-pad' },
      { key: 'accountNumber', label: 'Account number', placeholder: 'Account number', required: true, keyboardType: 'number-pad' },
    ]
  }
  if (currencyCode === 'GBP') {
    return [
      { key: 'fullName', label: 'Account name', placeholder: 'Account name', required: true },
      { key: 'bankName', label: 'Bank name', placeholder: 'Bank name', required: true },
      { key: 'sortCode', label: 'Sort code', placeholder: 'Sort code', required: true, keyboardType: 'number-pad' },
      { key: 'accountNumber', label: 'Account number', placeholder: 'Account number', required: true, keyboardType: 'number-pad' },
    ]
  }
  if (currencyCode === 'EUR') {
    return [
      { key: 'fullName', label: 'Account name', placeholder: 'Account name', required: true },
      { key: 'bankName', label: 'Bank name', placeholder: 'Bank name', required: true },
      { key: 'iban', label: 'IBAN', placeholder: 'IBAN', required: true },
      { key: 'swiftBic', label: 'SWIFT/BIC', placeholder: 'SWIFT/BIC', required: false },
    ]
  }
  return bankDefaultFields
}

export const recipientCatalog: RecipientCatalogEntry[] = [
  ...noahBankCountryCurrencies.map((entry) => ({
    ...entry,
    recipientType: 'bank' as const,
    status: 'supported' as const,
    fields: getBankFieldsForCurrency(entry.currencyCode),
  })),
  { countryCode: 'BJ', countryName: 'Benin', currencyCode: 'XOF', currencyName: 'West African CFA Franc', recipientType: 'mobile_money', status: 'supported', providers: ['MTN', 'Moov Money'], fields: mobileMoneyFields },
  { countryCode: 'BW', countryName: 'Botswana', currencyCode: 'BWP', currencyName: 'Botswana Pula', recipientType: 'mobile_money', status: 'supported', providers: ['MyZaka'], fields: mobileMoneyFields },
  { countryCode: 'CM', countryName: 'Cameroon', currencyCode: 'XAF', currencyName: 'Central African CFA Franc', recipientType: 'mobile_money', status: 'supported', providers: ['MTN', 'Orange'], fields: mobileMoneyFields },
  { countryCode: 'CI', countryName: 'Ivory Coast', currencyCode: 'XOF', currencyName: 'West African CFA Franc', recipientType: 'mobile_money', status: 'supported', providers: ['Moov Money', 'MTN', 'Wave'], fields: mobileMoneyFields },
  { countryCode: 'KE', countryName: 'Kenya', currencyCode: 'KES', currencyName: 'Kenyan Shilling', recipientType: 'mobile_money', status: 'supported', providers: ['Airtel Money', 'M-PESA'], fields: mobileMoneyFields },
  { countryCode: 'MW', countryName: 'Malawi', currencyCode: 'MWK', currencyName: 'Malawian Kwacha', recipientType: 'mobile_money', status: 'supported', providers: ['Airtel Money', 'TNM'], fields: mobileMoneyFields },
  { countryCode: 'RW', countryName: 'Rwanda', currencyCode: 'RWF', currencyName: 'Rwandan Franc', recipientType: 'mobile_money', status: 'supported', providers: ['MTN'], fields: mobileMoneyFields },
  { countryCode: 'SN', countryName: 'Senegal', currencyCode: 'XOF', currencyName: 'West African CFA Franc', recipientType: 'mobile_money', status: 'supported', providers: ['Orange', 'Wave', 'Free'], fields: mobileMoneyFields },
  { countryCode: 'TZ', countryName: 'Tanzania', currencyCode: 'TZS', currencyName: 'Tanzanian Shilling', recipientType: 'mobile_money', status: 'supported', providers: ['Airtel Money', 'TigoPesa'], fields: mobileMoneyFields },
  { countryCode: 'TG', countryName: 'Togo', currencyCode: 'XOF', currencyName: 'West African CFA Franc', recipientType: 'mobile_money', status: 'supported', providers: ['Moov Money', 'Togocell'], fields: mobileMoneyFields },
  { countryCode: 'UG', countryName: 'Uganda', currencyCode: 'UGX', currencyName: 'Ugandan Shilling', recipientType: 'mobile_money', status: 'supported', providers: ['Airtel Money', 'MTN'], fields: mobileMoneyFields },
  { countryCode: 'ZM', countryName: 'Zambia', currencyCode: 'ZMW', currencyName: 'Zambian Kwacha', recipientType: 'mobile_money', status: 'supported', providers: ['Airtel Money', 'MTN', 'TNM'], fields: mobileMoneyFields },
  { countryCode: 'BF', countryName: 'Burkina Faso', currencyCode: 'XOF', currencyName: 'West African CFA Franc', recipientType: 'mobile_money', status: 'coming_soon', providers: ['Coming soon'], fields: mobileMoneyFields },
  { countryCode: 'GA', countryName: 'Gabon', currencyCode: 'XAF', currencyName: 'Central African CFA Franc', recipientType: 'mobile_money', status: 'coming_soon', providers: ['Coming soon'], fields: mobileMoneyFields },
  { countryCode: 'ML', countryName: 'Mali', currencyCode: 'XOF', currencyName: 'West African CFA Franc', recipientType: 'mobile_money', status: 'coming_soon', providers: ['Coming soon'], fields: mobileMoneyFields },
  { countryCode: 'PH', countryName: 'Philippines', currencyCode: 'PHP', currencyName: 'Philippine Peso', recipientType: 'mobile_money', status: 'supported', providers: ['GCash', 'Maya'], fields: mobileMoneyFields },
  { countryCode: 'ID', countryName: 'Indonesia', currencyCode: 'IDR', currencyName: 'Indonesian Rupiah', recipientType: 'mobile_money', status: 'supported', providers: ['DANA', 'OVO', 'GoPay'], fields: mobileMoneyFields },
  { countryCode: 'IN', countryName: 'India', currencyCode: 'INR', currencyName: 'Indian Rupee', recipientType: 'mobile_money', status: 'supported', providers: ['UPI'], fields: mobileMoneyFields },
  { countryCode: 'NG', countryName: 'Nigeria', currencyCode: 'USDT', currencyName: 'Tether USD', recipientType: 'wallet', status: 'supported', providers: ['TRON', 'Ethereum', 'Solana'], fields: walletFields },
  { countryCode: 'KE', countryName: 'Kenya', currencyCode: 'USDC', currencyName: 'USD Coin', recipientType: 'wallet', status: 'supported', providers: ['Ethereum', 'Solana', 'Polygon'], fields: walletFields },
  { countryCode: 'US', countryName: 'United States', currencyCode: 'EURC', currencyName: 'Euro Coin', recipientType: 'wallet', status: 'supported', providers: ['Solana'], fields: walletFields },
  { countryCode: 'US', countryName: 'United States', currencyCode: 'BTC', currencyName: 'Bitcoin', recipientType: 'wallet', status: 'supported', providers: ['Bitcoin'], fields: walletFields },
  { countryCode: 'US', countryName: 'United States', currencyCode: 'SOL', currencyName: 'Solana', recipientType: 'wallet', status: 'supported', providers: ['Solana'], fields: walletFields },
  { countryCode: 'US', countryName: 'United States', currencyCode: 'PYUSD', currencyName: 'PayPal USD', recipientType: 'wallet', status: 'supported', providers: ['Base', 'Bitcoin'], fields: walletFields },
]

export function getCatalogByRecipientType(recipientType: RecipientType): RecipientCatalogEntry[] {
  return recipientCatalog.filter((entry) => entry.recipientType === recipientType)
}

export function getRecipientFormFields(currencyCode: string, recipientType: RecipientType): RecipientFieldSpec[] {
  const match = recipientCatalog.find(
    (entry) => entry.currencyCode === currencyCode && entry.recipientType === recipientType,
  )
  return match?.fields || []
}

export function getRecipientProviders(currencyCode: string, recipientType: RecipientType): string[] {
  const match = recipientCatalog.find(
    (entry) => entry.currencyCode === currencyCode && entry.recipientType === recipientType,
  )
  return match?.providers || []
}

export function getWalletAssets(): string[] {
  return Object.keys(walletAssetNetworkMap)
}

export function getWalletNetworksForAsset(asset: string): string[] {
  return walletAssetNetworkMap[String(asset || '').toUpperCase()] || []
}
