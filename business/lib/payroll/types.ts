export type PayrollPersonType = "employee" | "contractor"
export type PayrollPayBasis = "fixed" | "hourly"
export type PayrollRail = "easetag" | "bank" | "mobile" | "intl_bank" | "crypto"
export type PayrollPersonStatus = "active" | "held" | "terminated"

export type PayrollScheduleFrequency = "weekly" | "biweekly" | "monthly" | "semimonthly"

export type PayrollRunStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "executing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"

export type PayrollLineStatus = "pending" | "quoting" | "locked" | "paid" | "failed" | "skipped"

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
  metadata: Record<string, unknown>
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
  createdAt: string
  updatedAt: string
}

export interface PayrollRun {
  id: string
  businessId: string
  status: PayrollRunStatus
  scheduledFor: string | null
  sourceCurrency: string
  totalSource: number
  shortfall: number
  draftedBy: string | null
  approvedBy: string | null
  approvedAt: string | null
  executedAt: string | null
  fxSnapshot: Record<string, unknown>
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  lines?: PayrollLine[]
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
  funded: boolean
  shortfall: number
  availableBalance: number
  railMix: Record<PayrollRail, number>
  draftRunId: string | null
  pendingApprovalRunId: string | null
  recentRuns: PayrollRun[]
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
}
