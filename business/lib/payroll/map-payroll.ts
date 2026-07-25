import type {
  PayrollLine,
  PayrollLineStatus,
  PayrollPerson,
  PayrollPersonStatus,
  PayrollPersonType,
  PayrollPayBasis,
  PayrollRail,
  PayrollRun,
  PayrollRunStatus,
  PayrollSchedule,
  PayrollScheduleFrequency,
} from "@/lib/payroll/types"

export type PayrollPersonRow = {
  id: string
  business_id: string
  type: string
  full_name: string
  email: string | null
  country: string | null
  default_amount_cents: number | string
  pay_currency: string | null
  pay_basis: string | null
  hourly_rate_cents: number | string | null
  recipient_id: string | null
  easetag: string | null
  rail: string
  status: string
  connection_id?: string | null
  connection_status?: string | null
  readiness_status?: string | null
  identity_snapshot?: unknown
  metadata: unknown
  created_at: string
  updated_at: string
}

export type PayrollScheduleRow = {
  id: string
  business_id: string
  name: string
  frequency: string
  next_run_at: string
  active: boolean
  template: unknown
  created_at: string
  updated_at: string
}

export type PayrollRunRow = {
  id: string
  business_id: string
  status: string
  scheduled_for: string | null
  schedule_id?: string | null
  pay_period_start?: string | null
  pay_period_end?: string | null
  payday?: string | null
  revision?: number | string
  source_currency: string | null
  total_source_cents: number | string
  shortfall_cents: number | string
  drafted_by: string | null
  approved_by: string | null
  approved_at: string | null
  submitted_at?: string | null
  submitted_by?: string | null
  scheduled_at?: string | null
  approval_snapshot?: unknown
  executed_at: string | null
  fx_snapshot: unknown
  metadata: unknown
  created_at: string
  updated_at: string
}

export type PayrollLineRow = {
  id: string
  run_id: string
  person_id: string | null
  recipient_snapshot: unknown
  amount_cents: number | string
  pay_currency: string | null
  source_amount_cents: number | string
  rail: string
  status: string
  lock_id: string | null
  transfer_etid: string | null
  error_code: string | null
  error_message: string | null
  stub_storage_path: string | null
  payroll_document_id?: string | null
  settled_at?: string | null
  metadata: unknown
  created_at: string
  updated_at: string
}

function centsToAmount(cents: number | string | null | undefined): number {
  const n = typeof cents === "string" ? Number(cents) : Number(cents ?? 0)
  if (!Number.isFinite(n)) return 0
  return n / 100
}

function amountToCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  return Math.round(amount * 100)
}

function normalizePersonType(v: string | null | undefined): PayrollPersonType {
  return v === "contractor" ? "contractor" : "employee"
}

function normalizePayBasis(v: string | null | undefined): PayrollPayBasis {
  return v === "hourly" ? "hourly" : "fixed"
}

function normalizeRail(v: string | null | undefined): PayrollRail {
  const allowed: PayrollRail[] = ["easetag", "bank", "mobile", "intl_bank", "crypto"]
  const x = (v ?? "bank").toLowerCase() as PayrollRail
  return allowed.includes(x) ? x : "bank"
}

function normalizePersonStatus(v: string | null | undefined): PayrollPersonStatus {
  if (v === "held" || v === "terminated") return v
  return "active"
}

function normalizeRunStatus(v: string | null | undefined): PayrollRunStatus {
  const allowed: PayrollRunStatus[] = [
    "draft",
    "pending_approval",
    "approved",
    "scheduled",
    "executing",
    "completed",
    "partial",
    "failed",
    "needs_reapproval",
    "cancelled",
  ]
  const x = (v ?? "draft").toLowerCase() as PayrollRunStatus
  return allowed.includes(x) ? x : "draft"
}

function normalizeLineStatus(v: string | null | undefined): PayrollLineStatus {
  const allowed: PayrollLineStatus[] = ["pending", "quoting", "locked", "paid", "failed", "skipped"]
  const x = (v ?? "pending").toLowerCase() as PayrollLineStatus
  return allowed.includes(x) ? x : "pending"
}

function normalizeFrequency(v: string | null | undefined): PayrollScheduleFrequency {
  const allowed: PayrollScheduleFrequency[] = ["weekly", "biweekly", "monthly", "semimonthly"]
  const x = (v ?? "monthly").toLowerCase() as PayrollScheduleFrequency
  return allowed.includes(x) ? x : "monthly"
}

export function mapRowToPayrollPerson(row: PayrollPersonRow): PayrollPerson {
  return {
    id: row.id,
    businessId: row.business_id,
    type: normalizePersonType(row.type),
    fullName: row.full_name,
    email: row.email,
    country: row.country,
    defaultAmount: centsToAmount(row.default_amount_cents),
    payCurrency: String(row.pay_currency || "USD").toUpperCase(),
    payBasis: normalizePayBasis(row.pay_basis),
    hourlyRate: row.hourly_rate_cents != null ? centsToAmount(row.hourly_rate_cents) : null,
    recipientId: row.recipient_id,
    easetag: row.easetag,
    rail: normalizeRail(row.rail),
    status: normalizePersonStatus(row.status),
    connectionId: row.connection_id ?? null,
    connectionStatus: (
      ["pending", "approved", "declined", "expired", "revoked"].includes(String(row.connection_status))
        ? row.connection_status
        : "manual"
    ) as PayrollPerson["connectionStatus"],
    readinessStatus: String(row.readiness_status || (
      row.rail === "easetag" ? "pending_consent" : "ready"
    )),
    identitySnapshot: (row.identity_snapshot as Record<string, unknown>) ?? {},
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function payrollPersonToDbPayload(input: {
  businessId: string
  person: Partial<PayrollPerson> & { fullName: string; rail: PayrollRail; type: PayrollPersonType }
}): Record<string, unknown> {
  const p = input.person
  return {
    business_id: input.businessId,
    type: p.type,
    full_name: p.fullName.trim(),
    email: p.email?.trim() || null,
    country: p.country?.trim().toUpperCase() || null,
    default_amount_cents: amountToCents(p.defaultAmount ?? 0),
    pay_currency: String(p.payCurrency || "USD").toUpperCase(),
    pay_basis: p.payBasis ?? "fixed",
    hourly_rate_cents: p.hourlyRate != null ? amountToCents(p.hourlyRate) : null,
    recipient_id: p.recipientId ?? null,
    easetag: p.easetag?.trim().replace(/^@+/, "") || null,
    rail: p.rail,
    status: p.status ?? "active",
    metadata: p.metadata ?? {},
    updated_at: new Date().toISOString(),
  }
}

export function mapRowToPayrollSchedule(row: PayrollScheduleRow): PayrollSchedule {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    frequency: normalizeFrequency(row.frequency),
    nextRunAt: row.next_run_at,
    active: Boolean(row.active),
    template: (row.template as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapRowToPayrollRun(row: PayrollRunRow, lines?: PayrollLine[]): PayrollRun {
  return {
    id: row.id,
    businessId: row.business_id,
    status: normalizeRunStatus(row.status),
    scheduledFor: row.scheduled_for,
    scheduleId: row.schedule_id ?? null,
    payPeriodStart: row.pay_period_start ?? null,
    payPeriodEnd: row.pay_period_end ?? null,
    payday: row.payday ?? null,
    revision: Number(row.revision ?? 1),
    sourceCurrency: String(row.source_currency || "USD").toUpperCase(),
    totalSource: centsToAmount(row.total_source_cents),
    shortfall: centsToAmount(row.shortfall_cents),
    draftedBy: row.drafted_by,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    submittedAt: row.submitted_at ?? null,
    submittedBy: row.submitted_by ?? null,
    scheduledAt: row.scheduled_at ?? null,
    approvalSnapshot: (row.approval_snapshot as PayrollRun["approvalSnapshot"]) ?? null,
    executedAt: row.executed_at,
    fxSnapshot: (row.fx_snapshot as Record<string, unknown>) ?? {},
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lines,
  }
}

export function mapRowToPayrollLine(row: PayrollLineRow): PayrollLine {
  const snap = (row.recipient_snapshot as Record<string, unknown>) ?? {}
  return {
    id: row.id,
    runId: row.run_id,
    personId: row.person_id,
    recipientSnapshot: snap,
    amount: centsToAmount(row.amount_cents),
    payCurrency: String(row.pay_currency || "USD").toUpperCase(),
    sourceAmount: centsToAmount(row.source_amount_cents),
    rail: normalizeRail(row.rail),
    status: normalizeLineStatus(row.status),
    lockId: row.lock_id,
    transferEtid: row.transfer_etid,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    stubStoragePath: row.stub_storage_path,
    payrollDocumentId: row.payroll_document_id ?? null,
    settledAt: row.settled_at ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    personName: typeof snap.fullName === "string" ? snap.fullName : undefined,
    personType:
      snap.type === "employee" || snap.type === "contractor" ? snap.type : undefined,
  }
}

export function nextPayrollRunDate(frequency: PayrollScheduleFrequency, from: Date): string {
  const d = new Date(from)
  switch (frequency) {
    case "weekly":
      d.setDate(d.getDate() + 7)
      break
    case "biweekly":
      d.setDate(d.getDate() + 14)
      break
    case "semimonthly":
      if (d.getDate() < 15) d.setDate(15)
      else {
        d.setMonth(d.getMonth() + 1)
        d.setDate(1)
      }
      break
    case "monthly":
    default:
      d.setMonth(d.getMonth() + 1)
      break
  }
  return d.toISOString().slice(0, 10)
}

export { amountToCents, centsToAmount }
