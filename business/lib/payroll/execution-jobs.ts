import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import {
  executePayrollRun,
  reconcilePayrollRunSettlements,
} from "@/lib/payroll/execute-run"
import { sendPayrollRunSummaryEmail } from "@/lib/payroll/send-run-summary-email"
import { sendPayrollStubEmailsForRun } from "@/lib/payroll/send-stub-email"
import { sendPayrollFundingReminderEmail } from "@/lib/payroll/send-funding-reminder-email"
import { sanitizePayrollExecutionError } from "@/lib/payroll/execution-error"

export type PayrollExecutionJob = {
  id: string
  run_id: string
  business_id: string
  status: "queued" | "processing" | "retry" | "completed" | "dead_letter"
  attempts: number
  failure_attempts: number
  processed_lines: number
  total_lines: number
  phase: "quoting" | "funding" | "executing" | "reconciling"
}

export async function enqueuePayrollExecution(
  admin: SupabaseClient,
  input: { runId: string; businessId: string },
): Promise<PayrollExecutionJob> {
  const { data: existing } = await admin
    .from("payroll_execution_jobs")
    .select("*")
    .eq("run_id", input.runId)
    .in("status", ["queued", "processing", "retry"])
    .maybeSingle()
  if (existing) return existing as PayrollExecutionJob
  const { count: totalLines } = await admin
    .from("payroll_lines")
    .select("id", { count: "exact", head: true })
    .eq("run_id", input.runId)
    .neq("status", "skipped")

  const { data, error } = await admin
    .from("payroll_execution_jobs")
    .insert({
      run_id: input.runId,
      business_id: input.businessId,
      status: "queued",
      phase: "quoting",
      total_lines: totalLines ?? 0,
      next_attempt_at: new Date().toISOString(),
    })
    .select("*")
    .single()
  if (error || !data) {
    if (error?.code === "23505") return enqueuePayrollExecution(admin, input)
    throw new Error(error?.message || "Could not queue payroll execution.")
  }
  return data as PayrollExecutionJob
}

export async function processPayrollExecutionJobs(
  admin: SupabaseClient,
  limit = 1,
) {
  const { data, error } = await admin.rpc("claim_payroll_execution_jobs", {
    p_limit: limit,
    p_lease_seconds: 300,
  })
  if (error) throw new Error(error.message)

  const completed: string[] = []
  const retrying: string[] = []
  const deadLetter: string[] = []

  for (const rawJob of data ?? []) {
    const job = rawJob as PayrollExecutionJob
    try {
      const userId = await resolveBusinessOrgOwnerUserId(admin, job.business_id)
      if (!userId) throw new Error("Business owner unavailable.")
      if (job.phase === "reconciling") {
        const reconciliation = await reconcilePayrollRunSettlements({
          admin,
          businessId: job.business_id,
          runId: job.run_id,
        })
        if (!reconciliation.terminal) {
          await admin.from("payroll_execution_jobs").update({
            status: "retry",
            next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
            lease_expires_at: null,
            last_error: null,
            processed_lines: reconciliation.completed + reconciliation.failed,
            updated_at: new Date().toISOString(),
          }).eq("id", job.id)
          retrying.push(job.run_id)
          continue
        }
        await sendPayrollStubEmailsForRun(admin, job.business_id, job.run_id).catch(() => undefined)
        await sendPayrollRunSummaryEmail({
          admin,
          businessId: job.business_id,
          runId: job.run_id,
          completed: reconciliation.completed,
          failed: reconciliation.failed,
        }).catch(() => undefined)
        await admin.from("payroll_execution_jobs").update({
          status: "completed",
          processed_lines: reconciliation.completed + reconciliation.failed,
          lease_expires_at: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id)
        completed.push(job.run_id)
        continue
      }
      const result = await executePayrollRun({
        admin,
        userId,
        businessId: job.business_id,
        runId: job.run_id,
        batchLimit: 10,
        maxDurationMs: 45_000,
      })
      if (result.blocked === "needs_reapproval") {
        await admin.from("payroll_execution_jobs").update({
          status: "completed",
          phase: "funding",
          lease_expires_at: null,
          last_error: "needs_reapproval",
          updated_at: new Date().toISOString(),
        }).eq("id", job.id)
        completed.push(job.run_id)
        continue
      }
      if (result.blocked) {
        const { data: run } = await admin.from("payroll_runs")
          .select("payday,source_currency,total_source_cents,metadata")
          .eq("id", job.run_id)
          .maybeSingle()
        const { data: priorAlert } = await admin.from("payroll_run_events")
          .select("id,data")
          .eq("run_id", job.run_id)
          .eq("event_type", "run.execution_funding_alert_sent")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (run) {
          const currency = String(run.source_currency || "USD").toUpperCase()
          const required = Number(run.total_source_cents ?? 0) / 100
          const shortfall = Number(result.shortfall ?? 0)
          const priorData =
            (priorAlert?.data as Record<string, unknown> | null) ?? {}
          const fundingRequirementChanged =
            Number(priorData.required ?? -1) !== required ||
            Number(priorData.shortfall ?? -1) !== shortfall ||
            String(priorData.currency || "") !== currency
          const money = (amount: number) =>
            new Intl.NumberFormat("en", {
              style: "currency",
              currency,
              currencyDisplay: "code",
            }).format(amount)
          if (fundingRequirementChanged) {
            const recipients = await sendPayrollFundingReminderEmail({
              admin,
              businessId: job.business_id,
              runId: job.run_id,
              runName: String((run.metadata as Record<string, unknown> | null)?.name || "Payroll run"),
              paydayDisplay: run.payday ? new Date(`${run.payday}T12:00:00Z`).toLocaleDateString("en", {
                dateStyle: "long",
                timeZone: "UTC",
              }) : "As soon as the account is funded",
              requiredDisplay: money(required),
              availableDisplay: money(Math.max(0, required - shortfall)),
              shortfallDisplay: money(shortfall),
            }).catch(() => 0)
            if (recipients > 0) {
              await admin.from("payroll_run_events").insert({
                business_id: job.business_id,
                run_id: job.run_id,
                event_type: "run.execution_funding_alert_sent",
                data: { recipients, required, shortfall, currency },
              })
            }
          }
        }
        await admin.from("payroll_execution_jobs").update({
          status: "retry",
          phase: "funding",
          next_attempt_at: new Date(Date.now() + 15 * 60_000).toISOString(),
          lease_expires_at: null,
          last_error: "insufficient_funds",
          updated_at: new Date().toISOString(),
        }).eq("id", job.id)
        retrying.push(job.run_id)
        continue
      }
      if (result.hasMore) {
        await admin.from("payroll_execution_jobs").update({
          status: "retry",
          phase: result.phase ?? "executing",
          processed_lines: result.completed + result.failed,
          next_attempt_at: new Date().toISOString(),
          lease_expires_at: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id)
        retrying.push(job.run_id)
        continue
      }
      if ((result.processing ?? 0) > 0) {
        await admin.from("payroll_execution_jobs").update({
          status: "retry",
          phase: "reconciling",
          next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
          lease_expires_at: null,
          last_error: null,
          processed_lines: result.completed + result.failed,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id)
        retrying.push(job.run_id)
        continue
      }

      await sendPayrollStubEmailsForRun(admin, job.business_id, job.run_id).catch(() => undefined)
      await sendPayrollRunSummaryEmail({
        admin,
        businessId: job.business_id,
        runId: job.run_id,
        completed: result.completed,
        failed: result.failed,
      }).catch(() => undefined)
      await admin.from("payroll_execution_jobs").update({
        status: "completed",
        processed_lines: result.completed + result.failed,
        lease_expires_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", job.id)
      completed.push(job.run_id)
    } catch (cause) {
      const message = sanitizePayrollExecutionError(cause)
      const failureAttempts = Number(job.failure_attempts ?? 0) + 1
      const terminal = failureAttempts >= 8
      await admin.from("payroll_execution_jobs").update({
          status: terminal ? "dead_letter" : "retry",
          failure_attempts: failureAttempts,
        next_attempt_at: new Date(
          Date.now() + Math.min(60, Math.max(1, 2 ** failureAttempts)) * 60_000,
        ).toISOString(),
        lease_expires_at: null,
        last_error: message.slice(0, 1000),
        updated_at: new Date().toISOString(),
      }).eq("id", job.id)
      if (terminal) {
        const { data: lines } = await admin.from("payroll_lines")
          .select("status")
          .eq("run_id", job.run_id)
          .neq("status", "skipped")
        const paid = (lines ?? []).filter((line) => line.status === "paid").length
        const failed = (lines ?? []).filter((line) => line.status === "failed").length
        await admin.from("payroll_run_events").insert({
          business_id: job.business_id,
          run_id: job.run_id,
          event_type: "run.execution_dead_lettered",
          data: { failureAttempts },
        })
        await sendPayrollRunSummaryEmail({
          admin,
          businessId: job.business_id,
          runId: job.run_id,
          completed: paid,
          failed,
        }).catch(() => undefined)
      }
      ;(terminal ? deadLetter : retrying).push(job.run_id)
    }
  }

  return { processed: (data ?? []).length, completed, retrying, deadLetter }
}
