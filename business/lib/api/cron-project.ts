/**
 * Crons are declared only on `api/vercel.json`. Unset = enabled.
 * Set `EASNER_CRONS_ENABLED=false` to pause them on the api project.
 */
export function cronJobsEnabledOnThisProject(): boolean {
  const raw = process.env.EASNER_CRONS_ENABLED?.trim().toLowerCase()
  if (raw === "false" || raw === "0" || raw === "off") return false
  return true
}

/** Paths Vercel Cron hits (see `vercel.json`). Used by Edge proxy to no-op safely. */
const SCHEDULED_INTERNAL_CRON_PATHS = new Set([
  "/api/internal/wallet-provisioning/process",
  "/api/internal/relay-deposits/reconcile",
  "/api/internal/health/realtime-publication",
  "/api/internal/invoices/mark-past-due",
  "/api/internal/invoices/send-reminders",
  "/api/internal/invoices/generate-recurring",
  "/api/internal/checkout/deliver-webhooks",
  "/api/internal/payroll/generate-drafts",
  "/api/internal/payroll/send-funding-alerts",
  "/api/internal/payroll/reconcile-stuck",
  "/api/internal/payroll/execute-scheduled",
  "/api/internal/payroll/process-execution-jobs",
  "/api/internal/payroll/retry-document-deliveries",
  "/api/internal/payroll/process-reversals",
])

export function isScheduledCronPath(pathname: string): boolean {
  return pathname.startsWith("/api/cron/") || SCHEDULED_INTERNAL_CRON_PATHS.has(pathname)
}
