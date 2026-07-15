/** Flatten Yellowcard `bankInfo` into copyable label/value pairs. */

const PREFERRED_KEYS = [
  'accountName',
  'account_name',
  'accountNumber',
  'account_number',
  'bankName',
  'bank_name',
  'bankCode',
  'bank_code',
  'iban',
  'sortCode',
  'sort_code',
  'routingNumber',
  'routing_number',
  'swiftCode',
  'swift_code',
  'swiftBic',
  'reference',
  'paymentReference',
  'phoneNumber',
  'phone_number',
  'branchCode',
  'branch_code',
] as const

const LABEL_BY_KEY: Record<string, string> = {
  accountName: 'Account Name',
  account_name: 'Account Name',
  accountNumber: 'Account Number',
  account_number: 'Account Number',
  bankName: 'Bank Name',
  bank_name: 'Bank Name',
  bankCode: 'Bank Code',
  bank_code: 'Bank Code',
  iban: 'IBAN',
  sortCode: 'Sort Code',
  sort_code: 'Sort Code',
  routingNumber: 'Routing Number',
  routing_number: 'Routing Number',
  swiftCode: 'SWIFT',
  swift_code: 'SWIFT',
  swiftBic: 'SWIFT/BIC',
  reference: 'Reference',
  paymentReference: 'Payment Reference',
  phoneNumber: 'Phone Number',
  phone_number: 'Phone Number',
  branchCode: 'Branch Code',
  branch_code: 'Branch Code',
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export type YcBankInfoField = { id: string; label: string; value: string }

export function ycBankInfoFields(
  bankInfo: Record<string, unknown> | null | undefined,
): YcBankInfoField[] {
  if (!bankInfo || typeof bankInfo !== 'object') return []
  const seen = new Set<string>()
  const out: YcBankInfoField[] = []

  const push = (key: string) => {
    if (seen.has(key)) return
    const raw = bankInfo[key]
    if (raw == null) return
    if (typeof raw === 'object') return
    const value = String(raw).trim()
    if (!value) return
    seen.add(key)
    out.push({
      id: key,
      label: LABEL_BY_KEY[key] ?? humanizeKey(key),
      value,
    })
  }

  for (const key of PREFERRED_KEYS) push(key)
  for (const key of Object.keys(bankInfo)) push(key)
  return out
}
