export type PayrollPersonType = "employee" | "contractor"
export type PayrollPayBasis = "fixed" | "hourly"
export type PayrollRail = "easetag" | "bank" | "mobile" | "intl_bank" | "crypto"
export type PayrollPersonStatus = "active" | "held" | "terminated"

export type PayrollScheduleFrequency = "weekly" | "biweekly" | "monthly" | "semimonthly"

export type PayrollRunStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "scheduled"
  | "executing"
  | "completed"
  | "partial"
  | "failed"
  | "needs_reapproval"
  | "cancelled"

export type PayrollLineStatus =
  | "pending"
  | "quoting"
  | "locked"
  | "processing"
  | "paid"
  | "failed"
  | "skipped"

export interface PayrollPerson {
  id: string
  businessId: string
  type: PayrollPersonType
  fullName: string
  email: string | null
  country: string | null
  defaultAmount: number
  payCurrency: string
  payBasis: PayrollPayBasis
  hourlyRate: number | null
  recipientId: string | null
  easetag: string | null
  rail: PayrollRail
  status: PayrollPersonStatus
  connectionId: string | null
  connectionStatus: "manual" | PayrollConnectionStatus
  readinessStatus: string
  identitySnapshot: Record<string, unknown>
  metadata: Record<string, unknown>
  internalReference?: string | null
  avatarUrl?: string | null
  receivingMethodSummary?: PayrollReceivingMethodSummary | null
  lastPaidAt?: string | null
  scheduleSummaries?: Array<{ id: string; name: string }>
  createdAt: string
  updatedAt: string
}

export interface PayrollSchedule {
  id: string
  businessId: string
  name: string
  frequency: PayrollScheduleFrequency
  nextRunAt: string
  active: boolean
  template: Record<string, unknown>
  personIds?: string[]
  createdAt: string
  updatedAt: string
}

export interface PayrollRun {
  id: string
  businessId: string
  status: PayrollRunStatus
  scheduledFor: string | null
  scheduleId: string | null
  sourceAccountId: string | null
  payPeriodStart: string | null
  payPeriodEnd: string | null
  payday: string | null
  revision: number
  sourceCurrency: string
  totalSource: number
  shortfall: number
  draftedBy: string | null
  approvedBy: string | null
  approvedAt: string | null
  submittedAt: string | null
  submittedBy?: string | null
  scheduledAt: string | null
  approvalSnapshot: PayrollApprovalSnapshot | null
  executedAt: string | null
  fxSnapshot: Record<string, unknown>
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  lines?: PayrollLine[]
  /** Hydrated for list views without loading every payment line. */
  peopleCount?: number
  lineStatusCounts?: Record<PayrollLineStatus, number>
  hasPayStubs?: boolean
}

export interface PayrollLine {
  id: string
  runId: string
  personId: string | null
  recipientSnapshot: Record<string, unknown>
  amount: number
  payCurrency: string
  sourceAmount: number
  rail: PayrollRail
  status: PayrollLineStatus
  lockId: string | null
  transferEtid: string | null
  errorCode: string | null
  errorMessage: string | null
  stubStoragePath: string | null
  payrollDocumentId: string | null
  payrollDocumentFilename?: string | null
  documentDeliveryStatus?: "queued" | "sent" | "delivered" | "failed" | null
  settledAt: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  /** Hydrated for UI */
  personName?: string
  personType?: PayrollPersonType
}

export interface PayrollOverview {
  nextPayday: string | null
  estimatedTotal: number
  sourceCurrency: string
  headcount: number
  activeCount: number
  heldCount: number
  needsDestinationCount: number
  connectedCount: number
  pendingConnectionCount: number
  attentionCount: number
  funded: boolean
  shortfall: number
  availableBalance: number
  railMix: Record<PayrollRail, number>
  draftRunId: string | null
  pendingApprovalRunId: string | null
  recentRuns: PayrollRun[]
  attentionItems: PayrollAttentionItem[]
}

export interface PayrollAttentionItem {
  code: string
  severity: "info" | "warning" | "critical"
  title: string
  description: string
  actionLabel: string
  actionHref: string
}

export type PayrollConnectionStatus = "pending" | "approved" | "declined" | "expired" | "revoked"
export type PayrollReceivingMethodType = "easetag" | "bank" | "mobile_money" | "stablecoin"
export type PayrollAccessRole = "viewer" | "preparer" | "approver"
export type PayrollDocumentDeliveryStatus = "queued" | "sent" | "delivered" | "failed"

export interface PayrollCapabilities {
  canView: boolean
  canPrepare: boolean
  canApprove: boolean
  canSelfApprove: boolean
  requireSeparateApprover: boolean
}

export interface PayrollReceivingMethodSummary {
  id: string
  type: PayrollReceivingMethodType
  label: string
  details: Record<string, string>
  preferred: boolean
  ownerType: "employee" | "business"
  status: "active" | "deleted"
}

export interface PayrollReceivingMethod extends PayrollReceivingMethodSummary {}

export interface PayrollConnectionSummary {
  id: string
  businessId: string
  businessName: string
  personId: string
  status: PayrollConnectionStatus
  methods?: PayrollReceivingMethodSummary[]
  preferredMethod: PayrollReceivingMethodSummary | null
  approvedAt: string | null
  revokedAt: string | null
}

export interface PayrollConnectionDetail extends PayrollConnectionSummary {
  sharedIdentity: {
    userId?: string
    legalName?: string
    residenceCountry?: string
    profilePhoto?: string
    easetag?: string
    verificationState?: string
    verifiedAt?: string
  }
  methods: PayrollReceivingMethodSummary[]
  paymentHistory: PayrollPaymentHistoryItem[]
}

export interface PayrollInvitationSummary {
  id: string
  connectionId: string
  businessId: string
  businessName: string
  businessEasetag: string | null
  personName: string
  status: PayrollConnectionStatus
  expiresAt: string
  sharedFields: string[]
  methods: PayrollReceivingMethodSummary[]
}

export interface PayrollReadinessIssue {
  code: string
  severity: "blocking" | "warning"
  personId?: string
  message: string
  actionLabel?: string
  actionHref?: string
}

export interface PayrollFundingSummary {
  currency: string
  total: number
  available: number
  shortfall: number
  funded: boolean
}

export interface PayrollDeliveryEstimate {
  rail: PayrollReceivingMethodType
  label: string
  estimatedArrival: string | null
}

export interface PayrollRunProgress {
  total: number
  paid: number
  processing: number
  failed: number
  skipped: number
}

export interface PayrollApprovalSnapshot {
  revision: number
  totalSource: number
  sourceCurrency: string
  approvedDebit: number
  approvedAt?: string
  executionSchedule?: PayrollExecutionSchedule
  people: Array<{
    lineId: string
    personId: string | null
    name: string
    amount: number
    currency: string
    method: Record<string, unknown>
  }>
}

export interface PayrollExecutionSchedule {
  payday: string
  localTime: string
  timezone: string
  scheduledAt: string
}

export interface PayrollTimingPreview extends PayrollExecutionSchedule {
  display: string
}

export interface PayrollDocument {
  id: string
  type: "pay_stub" | "payment_reversal"
  filename: string
  storagePath: string
  status: "generating" | "ready" | "failed"
  templateVersion: number
  metadata: PayrollPayStubMeta
  generatedAt: string
}

export interface PayrollDocumentDelivery {
  id: string
  documentId: string
  channel: "email"
  destinationMasked: string
  status: PayrollDocumentDeliveryStatus
  attempts: number
  lastError: string | null
}

export interface PayrollPayStubMeta {
  documentReference: string
  businessName: string
  payeeName: string
  amount: number
  currency: string
  payPeriodStart: string | null
  payPeriodEnd: string | null
  payday: string | null
  paidAt: string
  timezone?: string
  executionSchedule?: PayrollExecutionSchedule | Record<string, never>
  rail: string
  transferEtid: string | null
}

export interface PayrollPaymentHistoryItem {
  lineId: string
  businessName: string
  amount: number
  currency: string
  status: PayrollLineStatus
  paidAt: string | null
  document: PayrollDocument | null
}

export interface PayrollPersonInput {
  type: PayrollPersonType
  fullName: string
  email?: string | null
  country?: string | null
  defaultAmount: number
  payCurrency: string
  payBasis?: PayrollPayBasis
  hourlyRate?: number | null
  recipientId?: string | null
  easetag?: string | null
  rail: PayrollRail
  status?: PayrollPersonStatus
  internalReference?: string | null
  scheduleIds?: string[]
  receivingMethod?: PayrollExternalReceivingMethodInput
}

export interface PayrollBankInput {
  type: "bank"
  fullName?: string
  countryCode: string
  currency: string
  bankName: string
  accountNumber: string
  routingNumber?: string
  sortCode?: string
  iban?: string
  swiftBic?: string
  transferType?: "ACH" | "Wire" | "RTP" | "FEDNOW" | "SEPA" | "SEPA Instant"
  checkingOrSavings?: "checking" | "savings"
  phoneNumber?: string
  addressLine1?: string
  city?: string
  state?: string
  postalCode?: string
  email?: string
}

export interface PayrollMobileMoneyInput {
  type: "mobile_money"
  fullName?: string
  countryCode: string
  currency: string
  provider: string
  phoneNumber: string
  email?: string
}

export interface PayrollStablecoinInput {
  type: "stablecoin"
  fullName?: string
  countryCode?: string
  currency: string
  asset: string
  network: string
  walletAddress: string
  email?: string
}

export type PayrollExternalReceivingMethodInput =
  | PayrollBankInput
  | PayrollMobileMoneyInput
  | PayrollStablecoinInput

export type CreatePayrollPersonCommand =
  | {
      mode: "easetag"
      easetag: string
      type: PayrollPersonType
      defaultAmount: number
      payCurrency: string
      internalReference?: string
      scheduleIds?: string[]
      sendInvitation: boolean
    }
  | {
      mode: "manual"
      fullName: string
      email: string
      country: string
      type: PayrollPersonType
      defaultAmount: number
      payCurrency: string
      internalReference?: string
      scheduleIds?: string[]
      receivingMethod: PayrollExternalReceivingMethodInput
    }

export interface PayrollRunDraftInput {
  name: string
  offCycle: boolean
  scheduleId?: string
  payPeriodStart: string
  payPeriodEnd: string
  payday: string
  sourceAccountId: string
  sourceCurrency: string
  lines: Array<{ personId: string; amount: number }>
  creationMode?: "new" | "duplicate" | "correction"
  sourceRunId?: string
}

export interface PayrollRunPreview {
  peopleCount: number
  payrollTotal: number
  fees: number
  sourceDebit: number
  availableBalance: number
  remainingBalance: number
  deliveryEstimates: PayrollDeliveryEstimate[]
  issues: PayrollReadinessIssue[]
}

export interface PayrollSettings {
  requireSeparateApprover: boolean
  timezone: string
  defaultSourceAccountId: string | null
  defaultCurrency: string
  defaultPaydayTime: string
}
