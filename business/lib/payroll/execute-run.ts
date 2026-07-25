import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { resolveNoahAccountContextFromLedgerScope } from "@/lib/processing-fee/capture-pending-processing-fee"
import { confirmPayoutOrder } from "@/lib/payout/confirm-payout-order"
import { cryptoCurrencyForBalanceCurrency, executeTurnkeyOfframpPayout } from "@/lib/noah/turnkey-offramp-orchestration"
import { executeYcBalancePayout } from "@/lib/yellowcard/balance-payout-execute"
import { executeGridBalancePayout } from "@/lib/grid/balance-payout-execute"
import {
  deterministicTransferGroupUuid,
  executeEasetagTransfer,
  isEasetagLedgerP2PEnabled,
} from "@/lib/ledger/easetag-transfer"
import { normalizeEasetag } from "@/lib/easetag-validation"
import { isUndefinedEasetagColumnError } from "@/lib/easetag-global"
import { normalizePayoutReviewSnapshot } from "@/lib/noah/build-payout-execute-snapshot"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import { resolveRecipientPayoutCountry } from "@/lib/terminal/recipient-sell-prepare"
import { generateTransactionId } from "@/lib/transaction-id"
import type { PayrollLineRow, PayrollRunRow } from "@/lib/payroll/map-payroll"

export type ExecutePayrollLineResult =
  | { ok: true; transferEtid: string }
  | { ok: false; error: string; errorCode?: string }

async function resolvePayeeFromEasetag(
  admin: SupabaseClient,
  tag: string,
  senderBusinessId: string,
): Promise<
  | { ok: true; payeeUserId: string; payeeBusinessId: string | null; payeeEasetag: string }
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
  if (!biz) return { ok: false, error: "Easetag not found." }
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

  const recipientId = String(snap.recipientId || "")
  if (!recipientId) throw new Error("Recipient required for this rail.")

  const acc = await resolveNoahAccountContextFromLedgerScope(input.admin, {
    userId: input.userId,
    businessId: input.businessId,
  })
  if (!acc) throw new Error("Could not resolve business account context.")

  const quote = await confirmPayoutOrder({
    ctx: acc,
    userId: input.userId,
    businessId: input.businessId,
    noahCustomerId: input.noahCustomerId,
    recipientId,
    receiveAmount: amount,
    sourceBalanceCurrency: input.sourceCurrency,
    note: "Payroll",
    paymentPurpose: "payroll",
  })

  const lockId = quote.lockId ?? null
  const sourceAmount = quote.totalDebited ?? quote.sendAmount ?? amount

  return {
    lockId,
    sourceAmount,
    executePayload: {
      rail,
      recipientId,
      receiveAmount: amount,
      receiveCurrency: quote.receiveCurrency,
      channelId: quote.channelId,
      payoutProvider: quote.provider ?? "noah",
      lockId,
      formSessionId: quote.noah?.formSessionId ?? quote.grid?.sequenceId,
      cryptoAuthorizedAmount: quote.noah?.cryptoAuthorizedAmount ?? String(quote.grid?.cryptoAmount ?? ""),
      totalDebited: quote.totalDebited,
      marginAmount: quote.marginAmount,
      processingFee: quote.processingFee,
      channelCost: quote.channelCost,
      customerPrincipal: quote.customerPrincipal,
      customerRate: quote.noah?.effectiveRate ?? quote.easner?.effectiveRate,
      ycSequenceId: quote.yc?.sequenceId,
      ycSendId: quote.yc?.sendId,
      ycWalletAddress: quote.yc?.walletAddress,
      ycCryptoAmount: quote.yc?.cryptoAmount,
      gridQuoteId: quote.grid?.quoteId,
      gridFundingAddress: quote.grid?.fundingAddress,
      gridCryptoAmount: quote.grid?.cryptoAmount,
      gridCustomerId: quote.grid?.customerId,
      gridExternalAccountId: quote.grid?.externalAccountId,
      noahFloor: quote.noah?.noahFloor,
      noahSendAmount: quote.noah?.noahSendAmount,
      marginCaptureMode: quote.noah?.marginCaptureMode,
      noahMid: quote.noah?.noahMid,
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
        ok: false,
        error: "The employee's payroll connection is no longer approved.",
        errorCode: "connection_not_approved",
      }
    }
  }

  if (rail === "easetag") {
    if (!isEasetagLedgerP2PEnabled()) {
      return { ok: false, error: "EASETAG transfers are not enabled.", errorCode: "easetag_disabled" }
    }

    const snap = (line.recipient_snapshot as Record<string, unknown>) ?? {}
    const tag = String(snap.easetag || executePayload.easetag || "")
    const amount =
      (typeof line.source_amount_cents === "string"
        ? Number(line.source_amount_cents)
        : Number(line.source_amount_cents ?? 0)) / 100

    const payee = await resolvePayeeFromEasetag(admin, tag, businessId)
    if (!payee.ok) return { ok: false, error: payee.error }

    const orgOwner = await resolveBusinessOrgOwnerUserId(admin, businessId)
    const senderUserId = orgOwner ?? userId
    const { data: senderBusiness } = await admin.from("businesses")
      .select("name").eq("id", businessId).maybeSingle()
    const runMeta = (run.metadata as Record<string, unknown>) ?? {}

    const reservedDebitEtid = generateTransactionId()
    const result = await executeEasetagTransfer(admin, {
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
      },
    })

    if (!result.ok) {
      return { ok: false, error: result.error || "EASETAG transfer failed.", errorCode: result.error }
    }

    return { ok: true, transferEtid: result.easnerTransactionId }
  }

  const recipientId = String(executePayload.recipientId || "")
  if (!recipientId) return { ok: false, error: "Missing recipient for payout line." }

  const { data: rec } = await admin
    .from("recipients")
    .select("*")
    .eq("id", recipientId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!rec) return { ok: false, error: "Recipient not found." }

  const recipientRow = rec as RecipientSellPrepareRow
  const fiatAmount = Number(executePayload.receiveAmount ?? 0)
  const fiatCurrency = String(executePayload.receiveCurrency || recipientRow.currency || "USD").toUpperCase()
  const countryCode = String(
    executePayload.countryCode || resolveRecipientPayoutCountry(recipientRow) || "",
  ).toUpperCase()

  const orgOwner = await resolveBusinessOrgOwnerUserId(admin, businessId)
  const txUserId = orgOwner ?? userId

  const acc = await resolveNoahAccountContextFromLedgerScope(admin, {
    userId,
    businessId,
  })
  if (!acc) return { ok: false, error: "Could not resolve business account context." }

  const lockId = String(line.lock_id || executePayload.lockId || "").trim() || undefined
  const reviewSnapshot = normalizePayoutReviewSnapshot(meta.reviewSnapshot)

  const payoutProvider = String(executePayload.payoutProvider || "noah").toLowerCase()

  if (payoutProvider === "grid") {
    const result = await executeGridBalancePayout({
      admin,
      userId: txUserId,
      businessId,
      recipientRow,
      recipientId,
      fiatAmount,
      fiatCurrency,
      countryCode,
      reviewSnapshot: reviewSnapshot ?? undefined,
      sendNote: "Payroll",
      idempotencyKey,
      lockId,
      grid: {
        quoteId: String(executePayload.gridQuoteId || executePayload.formSessionId || ""),
        sequenceId: String(executePayload.formSessionId || executePayload.gridQuoteId || ""),
        customerId: executePayload.gridCustomerId as string | undefined,
        externalAccountId: executePayload.gridExternalAccountId as string | undefined,
        cryptoAmount: Number(executePayload.gridCryptoAmount ?? 0),
        fundingAddress: String(executePayload.gridFundingAddress || ""),
      },
      pricing: {
        totalDebited: Number(executePayload.totalDebited ?? 0),
        customerPrincipal: Number(executePayload.customerPrincipal ?? executePayload.totalDebited ?? 0),
        marginAmount: Number(executePayload.marginAmount ?? 0),
        processingFee: Number(executePayload.processingFee ?? 0),
        channelCost: Number(executePayload.channelCost ?? 0),
        customerRate:
          executePayload.customerRate != null ? Number(executePayload.customerRate) : undefined,
      },
    })

    if (!result.ok) return { ok: false, error: result.error || "Grid payout failed." }
    return { ok: true, transferEtid: result.easnerTransactionId }
  }

  if (payoutProvider === "yellowcard") {
    const result = await executeYcBalancePayout({
      admin,
      userId: txUserId,
      businessId,
      recipientRow,
      recipientId,
      fiatAmount,
      fiatCurrency,
      countryCode,
      channelId: String(executePayload.channelId || "") || undefined,
      reviewSnapshot: reviewSnapshot ?? undefined,
      sendNote: "Payroll",
      idempotencyKey,
      lockId,
      yc: {
        sequenceId: String(executePayload.ycSequenceId || executePayload.formSessionId || "") || undefined,
        sendId: (executePayload.ycSendId as string | null) ?? null,
        cryptoAmount: Number(executePayload.ycCryptoAmount ?? 0),
        walletAddress: String(executePayload.ycWalletAddress || "") || undefined,
        channelId: String(executePayload.channelId || ""),
      },
      pricing: {
        totalDebited: Number(executePayload.totalDebited ?? 0),
        customerPrincipal: Number(executePayload.customerPrincipal ?? executePayload.totalDebited ?? 0),
        marginAmount: Number(executePayload.marginAmount ?? 0),
        processingFee: Number(executePayload.processingFee ?? 0),
        channelCost: Number(executePayload.channelCost ?? 0),
        customerRate:
          executePayload.customerRate != null ? Number(executePayload.customerRate) : undefined,
      },
    })

    if (!result.ok) return { ok: false, error: result.error || "Yellowcard payout failed." }
    return { ok: true, transferEtid: result.easnerTransactionId }
  }

  const result = await executeTurnkeyOfframpPayout({
    admin,
    ctx: acc,
    userId: txUserId,
    businessId,
    recipientRow,
    recipientId,
    fiatAmount,
    fiatCurrency,
    cryptoCurrency: cryptoCurrencyForBalanceCurrency(fiatCurrency),
    countryCode,
    channelId: String(executePayload.channelId || "") || undefined,
    reviewSnapshot: reviewSnapshot ?? undefined,
    sendNote: "Payroll",
    idempotencyKey,
    lockId,
    ...(executePayload.formSessionId && executePayload.cryptoAuthorizedAmount
      ? {
          quotedSession: {
            formSessionId: String(executePayload.formSessionId),
            cryptoAuthorizedAmount: String(executePayload.cryptoAuthorizedAmount),
            ...(executePayload.channelId ? { channelId: String(executePayload.channelId) } : {}),
            ...(executePayload.noahFloor ? { noahFloor: String(executePayload.noahFloor) } : {}),
            ...(executePayload.noahSendAmount
              ? { noahSendAmount: String(executePayload.noahSendAmount) }
              : {}),
            ...(executePayload.totalDebited
              ? { totalDebited: String(executePayload.totalDebited) }
              : {}),
            ...(executePayload.marginAmount
              ? { marginAmount: String(executePayload.marginAmount) }
              : {}),
            ...(executePayload.marginCaptureMode
              ? {
                  marginCaptureMode: executePayload.marginCaptureMode as
                    | "surplus_send"
                    | "split_debit",
                }
              : {}),
            ...(executePayload.customerRate != null
              ? { customerRate: Number(executePayload.customerRate) }
              : {}),
            ...(executePayload.noahMid != null ? { noahMid: Number(executePayload.noahMid) } : {}),
          },
        }
      : {}),
  })

  if (!result.ok) return { ok: false, error: result.error || "Payout failed." }
  return { ok: true, transferEtid: result.easnerTransactionId }
}

export async function approvePayrollRun(input: {
  admin: SupabaseClient
  userId: string
  businessId: string
  runId: string
  noahCustomerId: string
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
      const msg = e instanceof Error ? e.message : "Quote lock failed"
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

  if (quoteFailures.length > 0) {
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
}): Promise<{ completed: number; failed: number; partial: boolean }> {
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

  await admin
    .from("payroll_runs")
    .update({ status: "executing", updated_at: new Date().toISOString() })
    .eq("id", runId)

  const { data: lines } = await admin
    .from("payroll_lines")
    .select("*")
    .eq("run_id", runId)
    .in("status", ["pending", "locked", "failed"])

  let completed = 0
  let failed = 0

  for (const line of lines ?? []) {
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

    if (result.ok) {
      completed++
      await admin
        .from("payroll_lines")
        .update({
          status: "paid",
          transfer_etid: result.transferEtid,
          settled_at: new Date().toISOString(),
          error_code: null,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
    } else {
      failed++
      await admin
        .from("payroll_lines")
        .update({
          status: "failed",
          error_code: result.errorCode ?? "execute_failed",
          error_message: result.error,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
    }
  }

  const { data: allLines } = await admin.from("payroll_lines").select("status").eq("run_id", runId)

  const paidCount = (allLines ?? []).filter((l) => l.status === "paid").length
  const failCount = (allLines ?? []).filter((l) => l.status === "failed").length
  const totalActive = (allLines ?? []).filter((l) => l.status !== "skipped").length

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

  return { completed, failed, partial: finalStatus === "partial" }
}
