import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { resolveNoahAccountContextFromLedgerScope } from "@/lib/processing-fee/capture-pending-processing-fee"
import {
  executeEasetagTransfer,
  executeEasetagTransferToPlatformCustomer,
  isEasetagLedgerP2PEnabled,
} from "@/lib/ledger/easetag-transfer"
import { normalizeEasetag } from "@/lib/easetag-validation"
import { isUndefinedEasetagColumnError } from "@/lib/easetag-global"
import { normalizePayoutReviewSnapshot } from "@/lib/noah/build-payout-execute-snapshot"
import { generateTransactionId } from "@/lib/transaction-id"
import type { PayrollLineRow, PayrollRunRow } from "@/lib/payroll/map-payroll"
import {
  sendDestinationFromRow,
  type SendDestinationRow,
} from "@/lib/send-destination"
import { readBusinessAvailableBalance } from "@/lib/payroll/helpers"
import {
  executeSendDestination,
  lockSendDestination,
} from "@/lib/send-destination-operations"
import { sanitizePayrollExecutionError } from "@/lib/payroll/execution-error"
import { classifyPayrollSettlementStatus } from "@/lib/payroll/settlement-status"

export type ExecutePayrollLineResult =
  | { state: "settled"; transactionId: string }
  | { state: "submitted"; transactionId: string }
  | { state: "failed"; code: string; message: string }

async function resolvePayrollExternalRecipient(
  admin: SupabaseClient,
  businessId: string,
  line: PayrollLineRow,
): Promise<{
  recipientId: string
  destinationRef: string
  senderUserId: string
  recipient: SendDestinationRow
}> {
  const snapshot = (line.payment_method_snapshot as Record<string, unknown> | null) ?? {}
  const recipientSnapshot = (line.recipient_snapshot as Record<string, unknown> | null) ?? {}
  const methodId = String(line.payment_method_id || snapshot.id || "")
  const legacyRecipientId = String(snapshot.providerRecipientId || recipientSnapshot.recipientId || "")

  if (methodId) {
    const { data: method } = await admin
      .from("payroll_payment_methods")
      .select("id,person_id,business_id,connection_id,owner_type,type,full_name,country_code,currency,account_number,bank_name,phone_number,email,mobile_provider,wallet_network,routing_number,sort_code,iban,swift_bic,transfer_type,checking_or_savings,address_line1,city,state,postal_code,metadata")
      .eq("id", methodId)
      .eq("person_id", line.person_id)
      .eq("business_id", businessId)
      .maybeSingle()
    if (!method) {
      throw new Error("The approved receiving method could not be verified.")
    }
    if (!method.account_number || !method.currency || !method.full_name) {
      throw new Error("The approved receiving method is incomplete.")
    }
    const senderUserId = String(await resolveBusinessOrgOwnerUserId(admin, businessId) || "")
    if (!senderUserId) throw new Error("Business sender could not be verified.")
    const recipient = sendDestinationFromRow(method, "payroll_method")
    return {
      recipientId: String(method.id),
      destinationRef: recipient.destinationRef,
      senderUserId,
      recipient,
    }
  }
  if (legacyRecipientId) {
    throw new Error("This legacy Payroll method must be migrated before it can be sent.")
  }
  throw new Error("Receiving method is missing its payment destination.")
}

async function resolvePayeeFromEasetag(
  admin: SupabaseClient,
  tag: string,
  senderBusinessId: string,
  currency = "USD",
): Promise<
  | { ok: true; payeeUserId: string; payeeBusinessId: string | null; payeeEasetag: string; payeePlatformAccountId?: string }
  | { ok: false; error: string }
> {
  const cleanTag = normalizeEasetag(tag)
  const { data: payeeUser, error: payeeUserErr } = await admin
    .from("users")
    .select("id,easetag")
    .eq("easetag", cleanTag)
    .maybeSingle()

  if (payeeUserErr && !isUndefinedEasetagColumnError(payeeUserErr)) {
    return { ok: false, error: payeeUserErr.message }
  }

  if (payeeUser && !(payeeUserErr && isUndefinedEasetagColumnError(payeeUserErr))) {
    return {
      ok: true,
      payeeUserId: String(payeeUser.id),
      payeeBusinessId: null,
      payeeEasetag: String(payeeUser.easetag || cleanTag),
    }
  }

  const { data: biz, error: bizErr } = await admin
    .from("businesses")
    .select("id,easetag")
    .eq("easetag", cleanTag)
    .maybeSingle()

  if (bizErr) return { ok: false, error: bizErr.message }
  if (!biz) {
    const { resolveEasetagPayee } = await import("@/lib/easetag-payee")
    const platform = await resolveEasetagPayee(admin, cleanTag, currency)
    if (platform?.kind === "platform_customer") {
      return {
        ok: true,
        payeeUserId: platform.accountId,
        payeeBusinessId: null,
        payeeEasetag: platform.easetag,
        payeePlatformAccountId: platform.accountId,
      }
    }
    return { ok: false, error: "Easetag not found." }
  }
  if (biz.id === senderBusinessId) return { ok: false, error: "Cannot pay your own business easetag." }

  const ownerUserId = await resolveBusinessOrgOwnerUserId(admin, String(biz.id))
  if (!ownerUserId) return { ok: false, error: "Payee business owner not found." }

  return {
    ok: true,
    payeeUserId: ownerUserId,
    payeeBusinessId: String(biz.id),
    payeeEasetag: String(biz.easetag || cleanTag),
  }
}

export async function lockPayrollLineQuote(input: {
  admin: SupabaseClient
  userId: string
  businessId: string
  line: PayrollLineRow
  sourceCurrency: string
  noahCustomerId: string
}): Promise<{ lockId: string | null; sourceAmount: number; executePayload: Record<string, unknown> }> {
  const rail = String(input.line.rail)
  const snap = (input.line.recipient_snapshot as Record<string, unknown>) ?? {}
  const amount =
    (typeof input.line.amount_cents === "string"
      ? Number(input.line.amount_cents)
      : Number(input.line.amount_cents ?? 0)) / 100

  if (rail === "easetag") {
    const sourceAmount =
      (typeof input.line.source_amount_cents === "string"
        ? Number(input.line.source_amount_cents)
        : Number(input.line.source_amount_cents ?? 0)) / 100
    return {
      lockId: null,
      sourceAmount,
      executePayload: {
        rail: "easetag",
        easetag: snap.easetag,
        amount: sourceAmount,
        currency: input.sourceCurrency,
      },
    }
  }

  const destination = await resolvePayrollExternalRecipient(
    input.admin,
    input.businessId,
    input.line,
  )

  const acc = await resolveNoahAccountContextFromLedgerScope(input.admin, {
    userId: input.userId,
    businessId: input.businessId,
  })
  if (!acc) throw new Error("Could not resolve business account context.")

  const locked = await lockSendDestination({
    admin: input.admin,
    accountContext: acc,
    userId: destination.senderUserId,
    businessId: input.businessId,
    sourceCurrency: input.sourceCurrency,
    noahCustomerId: input.noahCustomerId,
  }, {
    destination: destination.recipient,
    amount,
    amountEntryMode: "receive",
    purpose: "payroll",
    note: "Payroll",
    idempotencyKey: `payroll_line:${input.line.id}`,
  })
  return {
    lockId: locked.lockId,
    sourceAmount: locked.sourceAmount,
    executePayload: {
      rail,
      ...locked.payload,
    },
  }
}

export async function executePayrollLine(input: {
  admin: SupabaseClient
  userId: string
  businessId: string
  line: PayrollLineRow
  run: PayrollRunRow
  idempotencyKey: string
}): Promise<ExecutePayrollLineResult> {
  const { admin, userId, businessId, line, run, idempotencyKey } = input
  const rail = String(line.rail)
  const meta = (line.metadata as Record<string, unknown>) ?? {}
  const executePayload = (meta.executePayload as Record<string, unknown>) ?? {}
  const sourceCurrency = String(run.source_currency || "USD").toUpperCase() as "USD" | "EUR"
  if (line.person_id) {
    const { data: connection } = await admin.from("payroll_connections")
      .select("status")
      .eq("person_id", line.person_id)
      .maybeSingle()
    if (connection && connection.status !== "approved") {
      return {
        state: "failed",
        message: "The employee's payroll connection is no longer approved.",
        code: "connection_not_approved",
      }
    }
  }

  if (rail === "easetag") {
    if (!isEasetagLedgerP2PEnabled()) {
      return { state: "failed", message: "EASETAG transfers are not enabled.", code: "easetag_disabled" }
    }

    const snap = (line.recipient_snapshot as Record<string, unknown>) ?? {}
    const tag = String(snap.easetag || executePayload.easetag || "")
    const amount =
      (typeof line.source_amount_cents === "string"
        ? Number(line.source_amount_cents)
        : Number(line.source_amount_cents ?? 0)) / 100

    const payee = await resolvePayeeFromEasetag(admin, tag, businessId, sourceCurrency)
    if (!payee.ok) return { state: "failed", message: payee.error, code: "easetag_payee_invalid" }

    const orgOwner = await resolveBusinessOrgOwnerUserId(admin, businessId)
    const senderUserId = orgOwner ?? userId
    const { data: senderBusiness } = await admin.from("businesses")
      .select("name").eq("id", businessId).maybeSingle()
    const runMeta = (run.metadata as Record<string, unknown>) ?? {}
    const executionSchedule = (
      (run.approval_snapshot as Record<string, unknown> | null)?.executionSchedule as
        | Record<string, unknown>
        | undefined
    )

    const reservedDebitEtid = generateTransactionId()
    const result = payee.payeePlatformAccountId
      ? await executeEasetagTransferToPlatformCustomer(admin, {
          idempotencyKey,
          amount,
          currency: sourceCurrency,
          senderUserId,
          senderBusinessId: businessId,
          payeePlatformAccountId: payee.payeePlatformAccountId,
          payeeEasetag: payee.payeeEasetag,
          reservedDebitEtid,
          sendNote: "Payroll",
          productMetadata: {
            product: "payroll",
            payroll_run_id: run.id,
            payroll_line_id: line.id,
            payroll_person_id: line.person_id,
            payroll_business_id: businessId,
            payroll_business_name: String(senderBusiness?.name || "Easner Business"),
            payroll_period_start: run.pay_period_start ?? null,
            payroll_period_end: run.pay_period_end ?? null,
            payroll_payday: run.payday ?? run.scheduled_for ?? null,
            payroll_method: "easetag",
            payroll_reference: run.id,
          },
        })
      : await executeEasetagTransfer(admin, {
      idempotencyKey,
      amount,
      currency: sourceCurrency,
      senderUserId,
      senderBusinessId: businessId,
      payeeUserId: payee.payeeUserId,
      payeeBusinessId: payee.payeeBusinessId,
      payeeEasetag: payee.payeeEasetag,
      reservedDebitEtid,
      sendNote: "Payroll",
      productMetadata: {
        product: "payroll",
        payroll_run_id: run.id,
        payroll_line_id: line.id,
        payroll_person_id: line.person_id,
        payroll_business_id: businessId,
        payroll_business_name: String(senderBusiness?.name || "Easner Business"),
        payroll_period_start: run.pay_period_start ?? null,
        payroll_period_end: run.pay_period_end ?? null,
        payroll_payday: run.payday ?? run.scheduled_for ?? null,
        payroll_method: "easetag",
        payroll_reference: run.id,
        payroll_run_name: typeof runMeta.name === "string" ? runMeta.name : null,
        payroll_timezone:
          typeof executionSchedule?.timezone === "string"
            ? executionSchedule.timezone
            : "UTC",
        payroll_scheduled_at:
          typeof executionSchedule?.scheduledAt === "string"
            ? executionSchedule.scheduledAt
            : null,
      },
    })

    if (!result.ok) {
      return {
        state: "failed",
        message: result.error || "EASETAG transfer failed.",
        code: result.error || "easetag_transfer_failed",
      }
    }

    return { state: "settled", transactionId: result.easnerTransactionId }
  }

  let destination
  try {
    destination = await resolvePayrollExternalRecipient(admin, businessId, line)
  } catch (cause) {
    return {
      state: "failed",
      message: cause instanceof Error ? cause.message : "Receiving method not found.",
      code: "receiving_method_unavailable",
    }
  }
  const recipientRow = destination.recipient
  const fiatAmount = Number(executePayload.receiveAmount ?? 0)

  const orgOwner = await resolveBusinessOrgOwnerUserId(admin, businessId)
  const txUserId = orgOwner ?? userId

  const acc = await resolveNoahAccountContextFromLedgerScope(admin, {
    userId,
    businessId,
  })
  if (!acc) {
    return {
      state: "failed",
      message: "Could not resolve business account context.",
      code: "business_account_unavailable",
    }
  }
  const reviewSnapshot = normalizePayoutReviewSnapshot(meta.reviewSnapshot)
  return executeSendDestination({
    admin,
    accountContext: acc,
    userId: txUserId,
    businessId,
    sourceCurrency,
    noahCustomerId: acc.noahCustomerId,
  }, {
    destination: recipientRow,
    amount: fiatAmount,
    amountEntryMode: "receive",
    purpose: "payroll",
    note: "Payroll",
    idempotencyKey,
    locked: {
      lockId: String(line.lock_id || executePayload.lockId || "").trim() || null,
      sourceAmount:
        executePayload.totalDebited != null
          ? Number(executePayload.totalDebited)
          : Number(line.source_amount_cents ?? 0) / 100,
      payload: executePayload,
    },
    reviewSnapshot,
  })
}

export async function approvePayrollRun(input: {
  admin: SupabaseClient
  userId: string
  businessId: string
  runId: string
  noahCustomerId: string
  deferQuotes?: boolean
  allowQuoteFailures?: boolean
}): Promise<void> {
  const { data: run } = await input.admin
    .from("payroll_runs")
    .select("*")
    .eq("id", input.runId)
    .eq("business_id", input.businessId)
    .maybeSingle()

  if (!run) throw new Error("Run not found.")

  const { data: lines } = await input.admin
    .from("payroll_lines")
    .select("*")
    .eq("run_id", input.runId)
    .neq("status", "skipped")

  if (input.deferQuotes) {
    let approvedSourceCents = 0
    const invalidLines: string[] = []
    for (const line of lines ?? []) {
      const row = line as PayrollLineRow
      const amountCents = Number(row.source_amount_cents ?? row.amount_cents ?? 0)
      const recipient = (row.recipient_snapshot as Record<string, unknown> | null) ?? {}
      const method = (row.payment_method_snapshot as Record<string, unknown> | null) ?? {}
      const rail = String(row.rail || "")
      const payrollMethodId = String(row.payment_method_id || method.id || "")
      const usable =
        Number.isFinite(amountCents) &&
        amountCents > 0 &&
        (rail === "easetag"
          ? Boolean(String(recipient.easetag || ""))
          : Boolean(payrollMethodId))
      if (!usable) {
        invalidLines.push(String(row.id))
        continue
      }
      approvedSourceCents += amountCents
      await input.admin
        .from("payroll_lines")
        .update({
          status: "pending",
          lock_id: null,
          error_code: null,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
    }
    if (invalidLines.length > 0) {
      throw new Error("Review the receiving method for each person before approving payroll.")
    }
    await input.admin
      .from("payroll_runs")
      .update({
        status: "approved",
        approved_by: input.userId,
        approved_at: new Date().toISOString(),
        total_source_cents: approvedSourceCents,
        fx_snapshot: {
          deferredUntilExecution: true,
          approvedAt: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.runId)
    return
  }

  const fxSnapshot: Record<string, unknown> = { lockedAt: new Date().toISOString(), lines: {} }
  let totalSourceCents = 0
  const quoteFailures: string[] = []

  for (const line of lines ?? []) {
    const row = line as PayrollLineRow
    if (row.status === "skipped") continue

    await input.admin
      .from("payroll_lines")
      .update({ status: "quoting", updated_at: new Date().toISOString() })
      .eq("id", row.id)

    try {
      const locked = await lockPayrollLineQuote({
        admin: input.admin,
        userId: input.userId,
        businessId: input.businessId,
        line: row,
        sourceCurrency: String(run.source_currency || "USD"),
        noahCustomerId: input.noahCustomerId,
      })

      totalSourceCents += Math.round(locked.sourceAmount * 100)

      await input.admin
        .from("payroll_lines")
        .update({
          status: locked.lockId ? "locked" : "pending",
          lock_id: locked.lockId,
          source_amount_cents: Math.round(locked.sourceAmount * 100),
          metadata: {
            ...((row.metadata as Record<string, unknown>) ?? {}),
            executePayload: locked.executePayload,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)

      ;(fxSnapshot.lines as Record<string, unknown>)[row.id] = locked.executePayload
    } catch (e) {
      const msg = sanitizePayrollExecutionError(e instanceof Error ? e.message : "Quote lock failed")
      quoteFailures.push(`${row.id}: ${msg}`)
      await input.admin
        .from("payroll_lines")
        .update({
          status: "failed",
          error_message: msg,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
    }
  }

  if (quoteFailures.length > 0 && !input.allowQuoteFailures) {
    await input.admin.from("payroll_runs").update({
      status: "pending_approval",
      updated_at: new Date().toISOString(),
    }).eq("id", input.runId)
    throw new Error("Resolve failed receiving-method or quote checks before approving payroll.")
  }

  await input.admin
    .from("payroll_runs")
    .update({
      status: "approved",
      approved_by: input.userId,
      approved_at: new Date().toISOString(),
      total_source_cents: totalSourceCents,
      fx_snapshot: fxSnapshot,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.runId)
}

export async function executePayrollRun(input: {
  admin: SupabaseClient
  userId: string
  businessId: string
  runId: string
  batchLimit?: number
  maxDurationMs?: number
}): Promise<{
  completed: number
  failed: number
  partial: boolean
  blocked?: "insufficient_funds" | "needs_reapproval"
  shortfall?: number
  hasMore?: boolean
  processing?: number
  phase?: "quoting" | "executing"
}> {
  const { admin, userId, businessId, runId } = input

  const { data: run } = await admin
    .from("payroll_runs")
    .select("*")
    .eq("id", runId)
    .eq("business_id", businessId)
    .maybeSingle()

  if (!run) throw new Error("Run not found.")
  if (run.status !== "approved" && run.status !== "executing" && run.status !== "partial") {
    throw new Error("Run is not approved for execution.")
  }

  const startedAt = Date.now()
  const batchLimit = Math.max(1, Math.min(input.batchLimit ?? 10, 25))
  const maxDurationMs = Math.max(5_000, input.maxDurationMs ?? 45_000)

  let { data: lines } = await admin
    .from("payroll_lines")
    .select("*")
    .eq("run_id", runId)
    .in("status", ["pending", "quoting", "locked"])

  const unquotedLines = (lines ?? []).filter((line) => {
    const metadata = (line.metadata as Record<string, unknown> | null) ?? {}
    const executePayload =
      (metadata.executePayload as Record<string, unknown> | null) ?? {}
    return Object.keys(executePayload).length === 0
  })
  if (unquotedLines.length > 0) {
    const account = await resolveNoahAccountContextFromLedgerScope(admin, {
      userId,
      businessId,
    })
    if (!account) throw new Error("Could not resolve business account context.")

    let quotedThisPass = 0
    for (const line of unquotedLines) {
      if (
        quotedThisPass >= batchLimit ||
        Date.now() - startedAt >= maxDurationMs
      ) {
        break
      }
      const row = line as PayrollLineRow
      await admin.from("payroll_lines").update({
        status: "quoting",
        updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("run_id", runId)
      try {
        const locked = await lockPayrollLineQuote({
          admin,
          userId,
          businessId,
          line: row,
          sourceCurrency: String(run.source_currency || "USD"),
          noahCustomerId: account.noahCustomerId,
        })
        await admin.from("payroll_lines").update({
          status: locked.lockId ? "locked" : "pending",
          lock_id: locked.lockId,
          source_amount_cents: Math.round(locked.sourceAmount * 100),
          metadata: {
            ...((row.metadata as Record<string, unknown> | null) ?? {}),
            executePayload: locked.executePayload,
          },
          error_code: null,
          error_message: null,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id).eq("run_id", runId)
      } catch (cause) {
        await admin.from("payroll_lines").update({
          status: "failed",
          error_code: "quote_failed",
          error_message: sanitizePayrollExecutionError(cause),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id).eq("run_id", runId)
      }
      quotedThisPass++
    }

    if (quotedThisPass < unquotedLines.length) {
      const { data: currentLines } = await admin
        .from("payroll_lines")
        .select("status")
        .eq("run_id", runId)
        .neq("status", "skipped")
      return {
        completed: (currentLines ?? []).filter((line) => line.status === "paid").length,
        failed: (currentLines ?? []).filter((line) => line.status === "failed").length,
        partial: false,
        hasMore: true,
        phase: "quoting",
      }
    }

    const refreshed = await admin
      .from("payroll_lines")
      .select("*")
      .eq("run_id", runId)
      .in("status", ["pending", "quoting", "locked"])
    lines = refreshed.data
  }

  const required =
    (lines ?? []).reduce((sum, line) => sum + Number(line.source_amount_cents ?? line.amount_cents ?? 0), 0) / 100
  await admin.from("payroll_runs").update({
    total_source_cents: Math.round(required * 100),
    updated_at: new Date().toISOString(),
  }).eq("id", runId).eq("business_id", businessId)
  const approvedDebit = Number(
    ((run.approval_snapshot as Record<string, unknown> | null) ?? {}).approvedDebit ?? 0,
  )
  if (approvedDebit > 0 && required > approvedDebit + 1e-9) {
    await admin.from("payroll_runs").update({
      status: "needs_reapproval",
      updated_at: new Date().toISOString(),
    }).eq("id", runId)
    await admin.from("payroll_run_events").insert({
      business_id: businessId,
      run_id: runId,
      event_type: "run.reapproval_required",
      data: { approvedDebit, exactDebit: required },
    })
    return {
      completed: 0,
      failed: 0,
      partial: false,
      blocked: "needs_reapproval",
    }
  }
  const currency = String(run.source_currency || "USD").toUpperCase()
  const available = await readBusinessAvailableBalance(admin, businessId, currency)
  if (available + 1e-9 < required) {
    const shortfall = Math.max(0, required - available)
    const runMetadata = (run.metadata as Record<string, unknown> | null) ?? {}
    await admin.from("payroll_runs").update({
      shortfall_cents: Math.round(shortfall * 100),
      metadata: {
        ...runMetadata,
        executionBlocker: {
          code: "insufficient_funds",
          requiredAmount: required,
          availableAmount: available,
          shortfall,
          checkedAt: new Date().toISOString(),
        },
      },
      updated_at: new Date().toISOString(),
    }).eq("id", runId)
    return { completed: 0, failed: 0, partial: false, blocked: "insufficient_funds", shortfall }
  }

  await admin
    .from("payroll_runs")
    .update({
      status: "executing",
      shortfall_cents: 0,
      metadata: {
        ...((run.metadata as Record<string, unknown> | null) ?? {}),
        executionBlocker: null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)

  const batch = (lines ?? []).slice(0, batchLimit)
  for (const line of batch) {
    if (Date.now() - startedAt >= maxDurationMs) break
    const row = line as PayrollLineRow
    const idempotencyKey = `payroll_line:${row.id}`

    await admin
      .from("payroll_lines")
      .update({ status: "quoting", updated_at: new Date().toISOString() })
      .eq("id", row.id)

    const result = await executePayrollLine({
      admin,
      userId,
      businessId,
      line: row,
      run: run as PayrollRunRow,
      idempotencyKey,
    })

    if (result.state === "settled") {
      await admin
        .from("payroll_lines")
        .update({
          status: "paid",
          transfer_etid: result.transactionId,
          settled_at: new Date().toISOString(),
          error_code: null,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
    } else if (result.state === "submitted") {
      await admin
        .from("payroll_lines")
        .update({
          status: "processing",
          transfer_etid: result.transactionId,
          error_code: null,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
    } else {
      await admin
        .from("payroll_lines")
        .update({
          status: "failed",
          error_code: result.code,
          error_message: sanitizePayrollExecutionError(result.message),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
    }
  }

  const { data: allLines } = await admin.from("payroll_lines").select("status").eq("run_id", runId)

  const paidCount = (allLines ?? []).filter((l) => l.status === "paid").length
  const failCount = (allLines ?? []).filter((l) => l.status === "failed").length
  const totalActive = (allLines ?? []).filter((l) => l.status !== "skipped").length
  const remainingCount = (allLines ?? []).filter((l) =>
    ["pending", "locked", "quoting"].includes(String(l.status)),
  ).length
  const processingCount = (allLines ?? []).filter((l) => l.status === "processing").length

  if (remainingCount > 0) {
    await admin.from("payroll_runs").update({
      status: "executing",
      updated_at: new Date().toISOString(),
    }).eq("id", runId)
    return {
      completed: paidCount,
      failed: failCount,
      partial: false,
      hasMore: true,
      processing: processingCount,
      phase: "executing",
    }
  }

  if (processingCount > 0) {
    await admin.from("payroll_runs").update({
      status: "executing",
      updated_at: new Date().toISOString(),
    }).eq("id", runId)
    return {
      completed: paidCount,
      failed: failCount,
      partial: false,
      processing: processingCount,
    }
  }

  let finalStatus: string = "completed"
  if (failCount > 0 && paidCount > 0) finalStatus = "partial"
  else if (failCount > 0 && paidCount === 0) finalStatus = "failed"
  else if (paidCount < totalActive) finalStatus = "partial"

  await admin
    .from("payroll_runs")
    .update({
      status: finalStatus,
      executed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)

  return {
    completed: paidCount,
    failed: failCount,
    partial: finalStatus === "partial",
    processing: 0,
  }
}

export async function reconcilePayrollRunSettlements(input: {
  admin: SupabaseClient
  businessId: string
  runId: string
}): Promise<{
  terminal: boolean
  completed: number
  failed: number
  processing: number
  status: "executing" | "completed" | "partial" | "failed"
}> {
  const { admin, businessId, runId } = input
  const { data: processingLines } = await admin
    .from("payroll_lines")
    .select("id,transfer_etid")
    .eq("run_id", runId)
    .eq("status", "processing")

  for (const line of processingLines ?? []) {
    const transactionId = String(line.transfer_etid || "").trim()
    if (!transactionId) continue
    const { data: transaction } = await admin
      .from("ledger_transactions")
      .select("status,settled_at,metadata")
      .eq("easner_transaction_id", transactionId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const settlementState = classifyPayrollSettlementStatus(transaction?.status)
    if (settlementState === "settled") {
      await admin.from("payroll_lines").update({
        status: "paid",
        settled_at: transaction?.settled_at || new Date().toISOString(),
        error_code: null,
        error_message: null,
        updated_at: new Date().toISOString(),
      }).eq("id", line.id).eq("status", "processing")
    } else if (settlementState === "failed") {
      const metadata = (transaction?.metadata as Record<string, unknown> | null) ?? {}
      await admin.from("payroll_lines").update({
        status: "failed",
        error_code: "provider_settlement_failed",
        error_message: sanitizePayrollExecutionError(
          metadata.failure_reason || "The payment provider reported a failed payment.",
        ),
        updated_at: new Date().toISOString(),
      }).eq("id", line.id).eq("status", "processing")
    }
  }

  const { data: lines } = await admin
    .from("payroll_lines")
    .select("status")
    .eq("run_id", runId)
    .neq("status", "skipped")
  const completed = (lines ?? []).filter((line) => line.status === "paid").length
  const failed = (lines ?? []).filter((line) => line.status === "failed").length
  const processing = (lines ?? []).filter((line) =>
    ["pending", "quoting", "locked", "processing"].includes(String(line.status)),
  ).length
  const status =
    processing > 0
      ? "executing"
      : failed > 0 && completed > 0
        ? "partial"
        : failed > 0
          ? "failed"
          : "completed"
  await admin.from("payroll_runs").update({
    status,
    ...(processing === 0 ? { executed_at: new Date().toISOString() } : {}),
    updated_at: new Date().toISOString(),
  }).eq("id", runId).eq("business_id", businessId)

  return { terminal: processing === 0, completed, failed, processing, status }
}
