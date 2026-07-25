import type { PayrollRunStatus } from "./types"

export const DELETABLE_PAYROLL_RUN_STATUSES: readonly PayrollRunStatus[] = [
  "draft",
  "failed",
]

export function canDeletePayrollRun(status: PayrollRunStatus): boolean {
  return DELETABLE_PAYROLL_RUN_STATUSES.includes(status)
}
