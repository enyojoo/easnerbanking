export type PayrollMethodType = 'easetag' | 'bank' | 'mobile_money' | 'stablecoin'

export type PayrollExternalMethodType = Exclude<PayrollMethodType, 'easetag'>

export type PayrollMethodSummary = {
  id: string
  type: PayrollMethodType
  label: string
  details: Record<string, string>
  preferred: boolean
}

export type PayrollInvitationDetail = {
  id: string
  connectionId: string
  businessName: string
  businessEasetag: string | null
  businessLogoUrl?: string | null
  businessVerified?: boolean
  personName: string
  status: string
  expiresAt: string
  sharedFields: string[]
  methods: PayrollMethodSummary[]
}

export type PayrollConnectionSummary = {
  id: string
  businessName: string
  businessEasetag?: string | null
  businessLogoUrl?: string | null
  businessVerified?: boolean
  status: string
  approvedAt: string | null
  revokedAt: string | null
  /** All active receiving methods; present on list responses for instant detail hydration. */
  methods?: PayrollMethodSummary[]
  preferredMethod: PayrollMethodSummary | null
}

export type PayrollPaymentHistoryItem = {
  lineId: string
  amount: number
  currency: string
  status: string
  paidAt: string | null
  paidAtDisplay?: string | null
  payday?: string | null
  timezone?: string
  document: {
    id?: string
    filename?: string
    metadata?: Record<string, unknown>
  } | null
}

export type PayrollConnectionDetail = Omit<PayrollConnectionSummary, 'methods'> & {
  readinessStatus: string | null
  sharedIdentity: Record<string, string | null>
  methods: PayrollMethodSummary[]
  paymentHistory: PayrollPaymentHistoryItem[]
}

export type PayrollConnectionsResponse = {
  connections: PayrollConnectionSummary[]
  pendingInvitations?: PayrollInvitationDetail[]
}

export type PayrollReceivingMethodContext = 'invitation' | 'connection'

export type PayrollReceivingMethodDraft = {
  context: PayrollReceivingMethodContext
  ownerId: string
  mode: 'add' | 'replace'
  existingMethod?: PayrollMethodSummary
}

export function payrollMethodTitle(method: PayrollMethodSummary | null): string {
  if (!method) return 'Receiving method needed'
  if (method.type === 'easetag') return 'Easetag'
  if (method.type === 'bank') return method.label || 'Bank account'
  if (method.type === 'mobile_money') return method.label || 'Mobile money'
  return method.label || 'Wallet address'
}

export function payrollMethodDescription(method: PayrollMethodSummary | null): string {
  if (!method) return 'Choose where you want to receive payroll'
  if (method.type === 'bank') {
    return [
      method.details.bankName,
      method.details.accountNumber,
      method.details.currency,
    ].filter(Boolean).join(' · ') || payrollMethodTitle(method)
  }
  if (method.type === 'mobile_money') {
    return [
      method.details.provider,
      method.details.phoneNumber,
      method.details.currency,
    ].filter(Boolean).join(' · ') || payrollMethodTitle(method)
  }
  if (method.type === 'stablecoin') {
    return [
      method.details.walletAddress,
      method.details.asset || method.details.currency,
      method.details.network,
    ].filter(Boolean).join(' · ') || payrollMethodTitle(method)
  }
  return method.details.easetag || payrollMethodTitle(method)
}
