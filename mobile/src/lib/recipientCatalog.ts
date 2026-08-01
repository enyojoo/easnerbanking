import {
  corridorMatchesCountryCurrency,
  mergeProviderBindingsIntoMetadata,
  resolveRecipientProviderBindings,
  findPayoutFieldsSchema,
  resolveCorridorRecipientOptions,
  resolvePrimaryPayoutProvider,
  sortByEasnerCountryPickerOrder,
  type CryptoDestinationPublic,
  type PayoutCorridorPublic,
  type PayoutFieldsSchemaHint,
  type PayoutRail,
} from '@easner/shared'

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

/**
 * Noah production `Network` strings (same catalog as business `WALLET_ASSET_NETWORKS`).
 * Polygon PoS → `PolygonPos` per Noah automated payout / on-chain workflow schema.
 */
export const walletAssetNetworkMap: Record<string, string[]> = {
  USDC: ['Base', 'Celo', 'Ethereum', 'Gnosis', 'Solana', 'Tron'],
  USDT: ['Celo', 'Ethereum', 'Tron'],
  BTC: ['Bitcoin'],
  EURC: ['Solana'],
  SOL: ['Solana'],
  PYUSD: ['FlowEvm', 'Solana'],
}

const bankDefaultFields: RecipientFieldSpec[] = [
  { key: 'fullName', label: 'Account name', placeholder: 'Account name', required: true },
  { key: 'bankName', label: 'Bank name', placeholder: 'Bank name', required: true },
  { key: 'accountNumber', label: 'Account number', placeholder: 'Account number', required: true, keyboardType: 'number-pad' },
]

export const mobileMoneyFields: RecipientFieldSpec[] = [
  { key: 'fullName', label: 'Account name', placeholder: 'Account name', required: true },
  { key: 'provider', label: 'Network', placeholder: 'Select network', required: true },
  { key: 'phoneNumber', label: 'Phone number', placeholder: '+2348012345678', required: true, keyboardType: 'phone-pad' },
]

const walletFields: RecipientFieldSpec[] = [
  { key: 'fullName', label: 'Wallet owner name', placeholder: 'Wallet owner name', required: true },
  { key: 'network', label: 'Network', placeholder: 'Select network', required: true },
  { key: 'walletAddress', label: 'Wallet address', placeholder: 'Wallet address', required: true },
]

const noahBankCountryCurrencies: Array<{ countryCode: string; countryName: string; currencyCode: string; currencyName: string }> = [
  { countryCode: 'US', countryName: 'United States', currencyCode: 'USD', currencyName: 'US Dollar' },
  { countryCode: 'CA', countryName: 'Canada', currencyCode: 'CAD', currencyName: 'Canadian Dollar' },
  { countryCode: 'AR', countryName: 'Argentina', currencyCode: 'ARS', currencyName: 'Argentine Peso' },
  { countryCode: 'AU', countryName: 'Australia', currencyCode: 'AUD', currencyName: 'Australian Dollar' },
  { countryCode: 'AT', countryName: 'Austria', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'BE', countryName: 'Belgium', currencyCode: 'EUR', currencyName: 'Euro' },
  { countryCode: 'BJ', countryName: 'Benin', currencyCode: 'XOF', currencyName: 'West African CFA Franc' },
  { countryCode: 'BR', countryName: 'Brazil', currencyCode: 'BRL', currencyName: 'Brazilian Real' },
  { countryCode: 'CH', countryName: 'Switzerland', currencyCode: 'CHF', currencyName: 'Swiss Franc' },
  { countryCode: 'CL', countryName: 'Chile', currencyCode: 'CLP', currencyName: 'Chilean Peso' },
  { countryCode: 'CO', countryName: 'Colombia', currencyCode: 'COP', currencyName: 'Colombian Peso' },
  { countryCode: 'CG', countryName: 'Congo', currencyCode: 'XAF', currencyName: 'Central African CFA Franc' },
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
  { countryCode: 'ZA', countryName: 'South Africa', currencyCode: 'ZAR', currencyName: 'South African Rand' },
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
  { countryCode: 'BW', countryName: 'Botswana', currencyCode: 'BWP', currencyName: 'Botswana Pula' },
  { countryCode: 'CM', countryName: 'Cameroon', currencyCode: 'XAF', currencyName: 'Central African CFA Franc' },
  { countryCode: 'KE', countryName: 'Kenya', currencyCode: 'KES', currencyName: 'Kenyan Shilling' },
  { countryCode: 'SN', countryName: 'Senegal', currencyCode: 'XOF', currencyName: 'West African CFA Franc' },
  { countryCode: 'TZ', countryName: 'Tanzania', currencyCode: 'TZS', currencyName: 'Tanzanian Shilling' },
  { countryCode: 'TG', countryName: 'Togo', currencyCode: 'XOF', currencyName: 'West African CFA Franc' },
  { countryCode: 'ZM', countryName: 'Zambia', currencyCode: 'ZMW', currencyName: 'Zambian Kwacha' },
  { countryCode: 'BF', countryName: 'Burkina Faso', currencyCode: 'XOF', currencyName: 'West African CFA Franc' },
  { countryCode: 'ML', countryName: 'Mali', currencyCode: 'XOF', currencyName: 'West African CFA Franc' },
]

/** Exported for corridor merge tests / tooling */
export function getBankFieldsForCurrency(currencyCode: string): RecipientFieldSpec[] {
  if (currencyCode === 'USD') {
    return [
      { key: 'fullName', label: 'Account name', placeholder: 'Account name', required: true },
      { key: 'bankName', label: 'Bank name', placeholder: 'Bank name', required: true },
      { key: 'routingNumber', label: 'Routing number', placeholder: 'Routing number', required: true, keyboardType: 'number-pad' },
      { key: 'accountNumber', label: 'Account number', placeholder: 'Account number', required: true, keyboardType: 'number-pad' },
    ]
  }
  if (currencyCode === 'CAD') {
    return [
      { key: 'fullName', label: 'Account name', placeholder: 'Account name', required: true },
      { key: 'bankName', label: 'Bank name', placeholder: 'Bank name', required: true },
      {
        key: 'routingNumber',
        label: 'Routing number (CPA)',
        placeholder: '9 digits (0 + institution + transit)',
        required: true,
        keyboardType: 'number-pad',
      },
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

export type PayoutCorridorCacheShape = {
  bank: PayoutCorridorPublic[]
  mobile: PayoutCorridorPublic[]
}

let payoutCorridorCache: PayoutCorridorCacheShape | null = null
let cryptoDestinationsCache: CryptoDestinationPublic[] | null = null

/** Updated when mobile loads/refreshes GET /api/send-destinations */
export function setPayoutCorridorCache(next: PayoutCorridorCacheShape | null) {
  payoutCorridorCache = next
}

export function getPayoutCorridorCache(): typeof payoutCorridorCache {
  return payoutCorridorCache
}

export function setCryptoDestinationsCache(next: CryptoDestinationPublic[] | null) {
  cryptoDestinationsCache = next
}

function useStaticRecipientCatalogFallback(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_USE_STATIC_RECIPIENT_CATALOG === 'true'
}

function corridorsToRecipientEntries(corridors: PayoutCorridorPublic[], kind: 'bank' | 'mobile_money'): RecipientCatalogEntry[] {
  return corridors.map((c) => ({
    countryCode: c.country_code,
    countryName: c.country_name,
    currencyCode: c.currency_code,
    currencyName: c.currency_name,
    recipientType: kind === 'bank' ? ('bank' as const) : ('mobile_money' as const),
    status: 'supported' as const,
    providers: kind === 'mobile_money' && Array.isArray(c.providers) ? (c.providers as string[]) : undefined,
    fields: kind === 'bank' ? getBankFieldsForCurrency(c.currency_code) : mobileMoneyFields,
  }))
}

function sortRecipientCatalogEntries(entries: RecipientCatalogEntry[]): RecipientCatalogEntry[] {
  return sortByEasnerCountryPickerOrder(
    entries,
    (e) => e.countryCode,
    (e) => e.countryName,
    (e) => e.currencyCode,
  )
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
  { countryCode: 'RW', countryName: 'Rwanda', currencyCode: 'RWF', currencyName: 'Rwandan Franc', recipientType: 'mobile_money', status: 'supported', providers: ['Airtel Money'], fields: mobileMoneyFields },
  { countryCode: 'SN', countryName: 'Senegal', currencyCode: 'XOF', currencyName: 'West African CFA Franc', recipientType: 'mobile_money', status: 'supported', providers: ['Orange', 'Wave', 'Free'], fields: mobileMoneyFields },
  { countryCode: 'TZ', countryName: 'Tanzania', currencyCode: 'TZS', currencyName: 'Tanzanian Shilling', recipientType: 'mobile_money', status: 'supported', providers: ['Airtel Money', 'TigoPesa'], fields: mobileMoneyFields },
  { countryCode: 'TG', countryName: 'Togo', currencyCode: 'XOF', currencyName: 'West African CFA Franc', recipientType: 'mobile_money', status: 'supported', providers: ['Moov Money', 'Togocell'], fields: mobileMoneyFields },
  { countryCode: 'UG', countryName: 'Uganda', currencyCode: 'UGX', currencyName: 'Ugandan Shilling', recipientType: 'mobile_money', status: 'supported', providers: ['Airtel Money', 'MTN'], fields: mobileMoneyFields },
  { countryCode: 'ZM', countryName: 'Zambia', currencyCode: 'ZMW', currencyName: 'Zambian Kwacha', recipientType: 'mobile_money', status: 'supported', providers: ['Airtel Money', 'MTN', 'TNM'], fields: mobileMoneyFields },
  { countryCode: 'BF', countryName: 'Burkina Faso', currencyCode: 'XOF', currencyName: 'West African CFA Franc', recipientType: 'mobile_money', status: 'coming_soon', providers: ['Coming soon'], fields: mobileMoneyFields },
  { countryCode: 'GA', countryName: 'Gabon', currencyCode: 'XAF', currencyName: 'Central African CFA Franc', recipientType: 'mobile_money', status: 'coming_soon', providers: ['Coming soon'], fields: mobileMoneyFields },
  { countryCode: 'ML', countryName: 'Mali', currencyCode: 'XOF', currencyName: 'West African CFA Franc', recipientType: 'mobile_money', status: 'coming_soon', providers: ['Coming soon'], fields: mobileMoneyFields },
  { countryCode: 'PH', countryName: 'Philippines', currencyCode: 'PHP', currencyName: 'Philippine Peso', recipientType: 'mobile_money', status: 'supported', providers: ['GCash', 'Maya'], fields: mobileMoneyFields },
  { countryCode: 'IN', countryName: 'India', currencyCode: 'INR', currencyName: 'Indian Rupee', recipientType: 'mobile_money', status: 'supported', providers: ['UPI'], fields: mobileMoneyFields },
  { countryCode: 'NG', countryName: 'Nigeria', currencyCode: 'USDT', currencyName: 'Tether USD', recipientType: 'wallet', status: 'supported', providers: ['TRON', 'Ethereum', 'Solana'], fields: walletFields },
  { countryCode: 'KE', countryName: 'Kenya', currencyCode: 'USDC', currencyName: 'USD Coin', recipientType: 'wallet', status: 'supported', providers: ['Ethereum', 'Solana'], fields: walletFields },
  { countryCode: 'US', countryName: 'United States', currencyCode: 'EURC', currencyName: 'Euro Coin', recipientType: 'wallet', status: 'supported', providers: ['Solana'], fields: walletFields },
  { countryCode: 'US', countryName: 'United States', currencyCode: 'BTC', currencyName: 'Bitcoin', recipientType: 'wallet', status: 'supported', providers: ['Bitcoin'], fields: walletFields },
  { countryCode: 'US', countryName: 'United States', currencyCode: 'SOL', currencyName: 'Solana', recipientType: 'wallet', status: 'supported', providers: ['Solana'], fields: walletFields },
  { countryCode: 'US', countryName: 'United States', currencyCode: 'PYUSD', currencyName: 'PayPal USD', recipientType: 'wallet', status: 'supported', providers: ['Base', 'Bitcoin'], fields: walletFields },
]

/** Intersect corridor/static catalog with office jurisdiction (KYB country allowlist). */
export function filterCatalogByJurisdictionPolicy(
  entries: RecipientCatalogEntry[],
  policy: { unrestricted: boolean; codes: string[] | null },
): RecipientCatalogEntry[] {
  if (policy.unrestricted || policy.codes == null) return entries
  const set = new Set(policy.codes.map((c) => c.toUpperCase()))
  return entries.filter((e) => set.has(e.countryCode.toUpperCase()))
}

export function getCatalogByRecipientTypeWithJurisdiction(
  recipientType: RecipientType,
  policy: { unrestricted: boolean; codes: string[] | null },
): RecipientCatalogEntry[] {
  return filterCatalogByJurisdictionPolicy(getCatalogByRecipientType(recipientType), policy)
}

/** Office send-destinations rows for recipient forms (parity with business recipient-form). */
export function buildRecipientCatalogForType(
  recipientType: RecipientType,
  sources: {
    bank: PayoutCorridorPublic[]
    mobile: PayoutCorridorPublic[]
    crypto: CryptoDestinationPublic[]
  },
): RecipientCatalogEntry[] {
  if (recipientType === 'wallet') {
    if (sources.crypto.length) {
      return sortRecipientCatalogEntries(cryptoToRecipientEntries(sources.crypto))
    }
    if (useStaticRecipientCatalogFallback()) {
      return sortRecipientCatalogEntries(recipientCatalog.filter((entry) => entry.recipientType === 'wallet'))
    }
    return []
  }
  if (recipientType === 'bank' && sources.bank.length) {
    return sortRecipientCatalogEntries(corridorsToRecipientEntries(sources.bank, 'bank'))
  }
  if (recipientType === 'mobile_money' && sources.mobile.length) {
    return sortRecipientCatalogEntries(corridorsToRecipientEntries(sources.mobile, 'mobile_money'))
  }
  if (!useStaticRecipientCatalogFallback()) return []
  return sortRecipientCatalogEntries(recipientCatalog.filter((entry) => entry.recipientType === recipientType))
}

function cryptoToRecipientEntries(destinations: CryptoDestinationPublic[]): RecipientCatalogEntry[] {
  return destinations.map((d) => ({
    countryCode: (d.country_code || 'XX').toUpperCase(),
    countryName: d.country_code || 'Global',
    currencyCode: d.asset_code,
    currencyName: d.asset_name,
    recipientType: 'wallet' as const,
    status: 'supported' as const,
    providers: d.networks,
    fields: walletFields,
  }))
}

export function getCatalogByRecipientType(recipientType: RecipientType): RecipientCatalogEntry[] {
  if (recipientType === 'wallet') {
    if (cryptoDestinationsCache?.length) {
      return sortRecipientCatalogEntries(cryptoToRecipientEntries(cryptoDestinationsCache))
    }
    if (useStaticRecipientCatalogFallback()) {
      return sortRecipientCatalogEntries(recipientCatalog.filter((entry) => entry.recipientType === 'wallet'))
    }
    return []
  }
  if (recipientType === 'bank' && payoutCorridorCache?.bank.length) {
    return sortRecipientCatalogEntries(corridorsToRecipientEntries(payoutCorridorCache.bank, 'bank'))
  }
  if (recipientType === 'mobile_money' && payoutCorridorCache?.mobile.length) {
    return sortRecipientCatalogEntries(corridorsToRecipientEntries(payoutCorridorCache.mobile, 'mobile_money'))
  }
  if (!useStaticRecipientCatalogFallback()) return []
  return sortRecipientCatalogEntries(recipientCatalog.filter((entry) => entry.recipientType === recipientType))
}

export function getPayoutCorridorRowForBindings(input: {
  countryCode: string
  currencyCode: string
  rail: 'bank_transfer' | 'mobile_money'
}): Pick<PayoutCorridorPublic, 'fields_schema' | 'providers'> | null {
  if (!payoutCorridorCache) return null
  const corridors =
    input.rail === 'mobile_money' ? payoutCorridorCache.mobile : payoutCorridorCache.bank
  const row = corridors.find((c) =>
    corridorMatchesCountryCurrency(c, {
      countryCode: input.countryCode,
      currencyCode: input.currencyCode,
      rail: input.rail,
    }),
  )
  if (!row) return null
  return { fields_schema: row.fields_schema, providers: row.providers }
}

export function mergeRecipientProviderBindings(input: {
  countryCode: string
  currencyCode: string
  rail: 'bank_transfer' | 'mobile_money'
  bankName?: string | null
  mobileProvider?: string | null
  metadata?: Record<string, unknown> | null
}): Record<string, unknown> {
  const corridor = getPayoutCorridorRowForBindings({
    countryCode: input.countryCode,
    currencyCode: input.currencyCode,
    rail: input.rail,
  })
  if (!corridor) return input.metadata ?? {}
  const bindings = resolveRecipientProviderBindings({
    countryCode: input.countryCode,
    currencyCode: input.currencyCode,
    rail: input.rail,
    bankName: input.bankName,
    mobileProvider: input.mobileProvider,
    fieldsSchema: corridor.fields_schema,
    providers: corridor.providers,
  })
  return mergeProviderBindingsIntoMetadata(input.metadata ?? null, bindings)
}

export function getPayoutFieldsSchemaForCorridor(input: {
  countryCode: string
  currencyCode: string
  rail: PayoutRail
}): PayoutFieldsSchemaHint | null {
  if (!payoutCorridorCache) return null
  const corridors =
    input.rail === 'mobile_money' ? payoutCorridorCache.mobile : payoutCorridorCache.bank
  return findPayoutFieldsSchema(corridors, {
    countryCode: input.countryCode,
    currencyCode: input.currencyCode,
    rail: input.rail,
  })
}

export function getRecipientFormFields(
  currencyCode: string,
  recipientType: RecipientType,
  countryCode?: string,
): RecipientFieldSpec[] {
  if (recipientType === 'bank' && countryCode && payoutCorridorCache?.bank.length) {
    const row = payoutCorridorCache.bank.find((c) =>
      corridorMatchesCountryCurrency(c, { countryCode, currencyCode }),
    )
    if (row) return getBankFieldsForCurrency(row.currency_code)
  }
  const match = recipientCatalog.find(
    (entry) => entry.currencyCode === currencyCode && entry.recipientType === recipientType,
  )
  return match?.fields || []
}

export function getCorridorRecipientOptions(input: {
  countryCode: string
  currencyCode: string
  rail: 'bank_transfer' | 'mobile_money'
}): ReturnType<typeof resolveCorridorRecipientOptions> {
  if (!payoutCorridorCache) {
    return { bankOptions: [], momoOptions: [], momoCandidates: [], extraFields: [] }
  }
  const corridors =
    input.rail === 'mobile_money' ? payoutCorridorCache.mobile : payoutCorridorCache.bank
  const row = corridors.find((c) =>
    corridorMatchesCountryCurrency(c, {
      countryCode: input.countryCode,
      currencyCode: input.currencyCode,
      rail: input.rail,
    }),
  )
  if (!row) {
    return { bankOptions: [], momoOptions: [], momoCandidates: [], extraFields: [] }
  }
  return resolveCorridorRecipientOptions({
    countryCode: input.countryCode,
    currencyCode: input.currencyCode,
    rail: input.rail,
    fieldsSchema: row.fields_schema,
    providers: row.providers,
    payoutProvider: resolvePrimaryPayoutProvider(row.provider_routing),
  })
}

export function getRecipientProviders(
  currencyCode: string,
  recipientType: RecipientType,
  countryCode?: string,
): string[] {
  if (recipientType === 'mobile_money' && countryCode && payoutCorridorCache?.mobile.length) {
    const options = getCorridorRecipientOptions({
      countryCode,
      currencyCode,
      rail: 'mobile_money',
    })
    if (options.momoOptions.length) return options.momoOptions
    return []
  }
  if (recipientType === 'bank' && countryCode && payoutCorridorCache?.bank.length) {
    const options = getCorridorRecipientOptions({
      countryCode,
      currencyCode,
      rail: 'bank_transfer',
    })
    if (options.bankOptions.length) return options.bankOptions
  }
  const match = recipientCatalog.find(
    (entry) => entry.currencyCode === currencyCode && entry.recipientType === recipientType,
  )
  return match?.providers || []
}

export function getCorridorBankOptions(
  currencyCode: string,
  countryCode?: string,
): string[] {
  if (!countryCode || !payoutCorridorCache?.bank.length) return []
  return getCorridorRecipientOptions({
    countryCode,
    currencyCode,
    rail: 'bank_transfer',
  }).bankOptions
}

export function getWalletAssets(): string[] {
  if (cryptoDestinationsCache?.length) {
    return [...new Set(cryptoDestinationsCache.map((d) => d.asset_code))]
  }
  return Object.keys(walletAssetNetworkMap)
}

export function getWalletNetworksForAsset(asset: string): string[] {
  const code = String(asset || '').toUpperCase()
  if (cryptoDestinationsCache?.length) {
    const nets = new Set<string>()
    for (const d of cryptoDestinationsCache) {
      if (d.asset_code.toUpperCase() !== code) continue
      for (const n of d.networks) nets.add(n)
    }
    if (nets.size) return [...nets]
  }
  return walletAssetNetworkMap[code] || []
}
