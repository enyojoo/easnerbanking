import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { normalizeEasetag } from "@/lib/easetag-validation"
import { isUndefinedEasetagColumnError } from "@/lib/easetag-global"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import {
  deleteEasetagSettlement,
  getEasetagSettlementByIdempotencyKey,
  insertEasetagSettlementPending,
  resetEasetagSettlementForRetry,
  updateEasetagSettlementFailed,
  updateEasetagSettlementLedgerPtids,
  updateEasetagSettlementSettled,
  updateEasetagSettlementSubmitted,
} from "@/lib/ledger/easetag-settlement"
import {
  deterministicTransferGroupUuid,
  executeEasetagTransfer,
  isEasetagChainSettlementEnabled,
  isEasetagLedgerP2PEnabled,
  rollbackEasetagP2pLedger,
} from "@/lib/ledger/easetag-transfer"
import {
  assetForEasetagCurrency,
  preflightSenderOnChainStablecoinBalance,
  resolvePayeeSolanaVaultAta,
  resolveSenderTurnkeySubOrgId,
} from "@/lib/ledger/easetag-turnkey-settlement"
import {
  fetchEasetagDebitSnapshot,
  notifyEasetagTransferFailed,
  notifyEasetagTransferSettled,
} from "@/lib/ledger/easetag-transfer-notify"
import { createTurnkeySend, reconcileTurnkeySendStatus } from "@/lib/turnkey/send"

export const runtime = "nodejs"

type Body = {
  destination_easetag?: string
  destinationEasetag?: string
  amount?: string | number
  currency?: string
  reserved_debit_etid?: string
  note?: string
}

/**
 * Instant Easetag P2P via internal ledger (USD/EUR buckets). Requires `EASETAG_LEDGER_P2P_ENABLED=true`.
 * Implemented in-app ({@link executeEasetagTransfer}): `wallet_balances` + `transactions` — no Postgres RPC.
 */
export async function POST(request: Request) {
  if (!isEasetagLedgerP2PEnabled()) {
    return NextResponse.json({ ok: false, error: "easetag_ledger_p2p_disabled" }, { status: 503 })
  }

  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const body = (await request.json().catch(() => null)) as Body | null
  const tag = String(body?.destination_easetag || body?.destinationEasetag || "").trim()
  const amount = Number.parseFloat(String(body?.amount ?? ""))
  const currencyRaw = String(body?.currency || "usd").trim().toUpperCase()

  if (!tag || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "destination_easetag and positive amount required" }, { status: 400 })
  }
  if (currencyRaw !== "USD" && currencyRaw !== "EUR") {
    return NextResponse.json({ error: "currency must be USD or EUR" }, { status: 400 })
  }

  const ledgerAmount = Math.round(amount * 100) / 100
  const sendNote = typeof body?.note === "string" ? body.note.trim() : ""

  const acc = await resolveNoahAccountContext(request, auth.user.id)
  if (!acc.ok) return acc.response

  const guard = await requireNoahVerificationApproved(
    acc.ctx.subjectUserId,
    acc.ctx.scope,
    acc.ctx.subjectBusinessId,
  )
  if (guard) return guard

  const admin = createSupabaseAdmin()
  const cleanTag = normalizeEasetag(tag)

  const { data: meRow, error: meErr } = await admin.from("users").select("id,easner_business_id").eq("id", auth.user.id).maybeSingle()
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 })
  const myBusinessId = (meRow?.easner_business_id as string | null | undefined) ?? null

  const { data: payeeUser, error: payeeUserErr } = await admin.from("users").select("id,easetag").eq("easetag", cleanTag).maybeSingle()
  if (payeeUserErr && !isUndefinedEasetagColumnError(payeeUserErr)) {
    return NextResponse.json({ error: payeeUserErr.message }, { status: 400 })
  }
  const resolvedPayeeUser = payeeUserErr && isUndefinedEasetagColumnError(payeeUserErr) ? null : payeeUser

  let payeeEasetagResolved = cleanTag
  let payeeUserId: string | undefined
  let payeeBusinessId: string | undefined

  if (resolvedPayeeUser) {
    if (resolvedPayeeUser.id === auth.user.id) {
      return NextResponse.json({ error: "You cannot send to yourself." }, { status: 400 })
    }
    payeeEasetagResolved = String(resolvedPayeeUser.easetag || cleanTag)
    payeeUserId = String(resolvedPayeeUser.id)
    payeeBusinessId = undefined
  } else {
    const { data: biz, error: bizErr } = await admin.from("businesses").select("id,easetag").eq("easetag", cleanTag).maybeSingle()
    if (bizErr) return NextResponse.json({ error: bizErr.message }, { status: 400 })
    if (!biz) return NextResponse.json({ error: "Easetag not found." }, { status: 404 })
    if (myBusinessId && biz.id === myBusinessId) {
      return NextResponse.json({ error: "You cannot send to yourself." }, { status: 400 })
    }
    payeeEasetagResolved = String(biz.easetag || cleanTag)
    payeeBusinessId = String(biz.id)
    const ownerUserId = await resolveBusinessOrgOwnerUserId(admin, biz.id as string)
    payeeUserId = ownerUserId || undefined
    if (!payeeUserId) {
      return NextResponse.json({ error: "Payee organization has no owner on file." }, { status: 400 })
    }
  }

  const senderBusinessId = acc.ctx.scope === "business" && acc.ctx.subjectBusinessId ? acc.ctx.subjectBusinessId : null
  const senderUserId = acc.ctx.subjectUserId

  let senderEasetag: string | null = null
  if (senderBusinessId) {
    const { data: sb } = await admin.from("businesses").select("easetag").eq("id", senderBusinessId).maybeSingle()
    senderEasetag = sb?.easetag != null ? String(sb.easetag).trim() : null
  } else {
    const { data: su } = await admin.from("users").select("easetag").eq("id", senderUserId).maybeSingle()
    senderEasetag = su?.easetag != null ? String(su.easetag).trim() : null
  }

  const idemHeader = request.headers.get("idempotency-key")?.trim() || request.headers.get("x-idempotency-key")?.trim()
  const idempotencyKey =
    idemHeader ||
    `easetag:${senderBusinessId || senderUserId}:${payeeBusinessId || payeeUserId}:${currencyRaw}:${amount}:${cleanTag}`

  const reservedDebit =
    typeof body?.reserved_debit_etid === "string" ? body.reserved_debit_etid.trim() : ""

  const transferGroupId = deterministicTransferGroupUuid(idempotencyKey)
  const chainSettle = isEasetagChainSettlementEnabled()
  let payeeAta: string | null = null
  let payeeVault: string | null = null

  if (chainSettle) {
    let settlementRow = await getEasetagSettlementByIdempotencyKey(admin, idempotencyKey)

    if (settlementRow?.status === "failed") {
      const debitPtidProbe = `easetag_p2p:${transferGroupId}:debit`
      const { data: debitProbe } = await admin
        .from("transactions")
        .select("id")
        .eq("provider", "easner_internal")
        .eq("provider_transaction_id", debitPtidProbe)
        .maybeSingle()
      if (!debitProbe?.id) {
        await deleteEasetagSettlement(admin, transferGroupId)
        settlementRow = null
      } else {
        await resetEasetagSettlementForRetry(admin, transferGroupId)
        settlementRow = await getEasetagSettlementByIdempotencyKey(admin, idempotencyKey)
      }
    }

    const payeeRes = await resolvePayeeSolanaVaultAta(admin, {
      payeeUserId: payeeUserId!,
      payeeBusinessId: payeeBusinessId ?? null,
      currency: currencyRaw as "USD" | "EUR",
    })
    if ("error" in payeeRes) {
      return NextResponse.json({ ok: false, error: payeeRes.error }, { status: 400 })
    }
    payeeAta = payeeRes.ata
    payeeVault = payeeRes.ownerVault

    const pre = await preflightSenderOnChainStablecoinBalance(admin, acc.ctx, currencyRaw as "USD" | "EUR", ledgerAmount)
    if (!pre.ok) {
      return NextResponse.json({ ok: false, error: pre.error }, { status: 400 })
    }

    if (!settlementRow) {
      const ins = await insertEasetagSettlementPending(admin, {
        transfer_group_id: transferGroupId,
        idempotency_key: idempotencyKey,
        sender_user_id: senderUserId,
        sender_business_id: senderBusinessId,
        payee_user_id: payeeUserId!,
        payee_business_id: payeeBusinessId ?? null,
        amount: ledgerAmount,
        currency: currencyRaw as "USD" | "EUR",
        asset: assetForEasetagCurrency(currencyRaw as "USD" | "EUR"),
      })
      if (!ins.ok && ins.error !== "duplicate_idempotency") {
        return NextResponse.json({ ok: false, error: ins.error }, { status: 400 })
      }
      settlementRow = await getEasetagSettlementByIdempotencyKey(admin, idempotencyKey)
    }

    if (settlementRow?.status === "settled") {
      const result = await executeEasetagTransfer(admin, {
        idempotencyKey,
        amount: ledgerAmount,
        currency: currencyRaw as "USD" | "EUR",
        senderUserId,
        senderBusinessId,
        payeeUserId: payeeUserId!,
        payeeBusinessId: payeeBusinessId ?? null,
        payeeEasetag: payeeEasetagResolved,
        senderEasetag: senderEasetag || undefined,
        reservedDebitEtid: reservedDebit || undefined,
        sendNote: sendNote || undefined,
      })
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
      }
      await notifyEasetagTransferSettled(admin, {
        idempotent: result.idempotent,
        debitProviderTransactionId: result.debitProviderTransactionId,
        creditProviderTransactionId: result.creditProviderTransactionId,
      }).catch((e) => console.warn("easetag transfer notify:", e))
      return NextResponse.json({
        ok: true,
        idempotent: result.idempotent,
        transfer_group_id: result.transferGroupId,
        debit_provider_transaction_id: result.debitProviderTransactionId,
        credit_provider_transaction_id: result.creditProviderTransactionId,
        easner_transaction_id: result.easnerTransactionId,
      })
    }

    if (settlementRow?.status === "submitted" && settlementRow.turnkey_send_status_id) {
      const result = await executeEasetagTransfer(admin, {
        idempotencyKey,
        amount: ledgerAmount,
        currency: currencyRaw as "USD" | "EUR",
        senderUserId,
        senderBusinessId,
        payeeUserId: payeeUserId!,
        payeeBusinessId: payeeBusinessId ?? null,
        payeeEasetag: payeeEasetagResolved,
        senderEasetag: senderEasetag || undefined,
        reservedDebitEtid: reservedDebit || undefined,
        sendNote: sendNote || undefined,
      })
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
      }
      const subOrgId = await resolveSenderTurnkeySubOrgId(admin, senderUserId, senderBusinessId)
      if (subOrgId) {
        const rec = await reconcileTurnkeySendStatus(admin, {
          subOrgId,
          providerTransactionId: settlementRow.turnkey_send_status_id,
        })
        if (rec.status === "settled") {
          await updateEasetagSettlementSettled(admin, transferGroupId, rec.txHash)
        }
      }
      await notifyEasetagTransferSettled(admin, {
        idempotent: result.idempotent,
        debitProviderTransactionId: result.debitProviderTransactionId,
        creditProviderTransactionId: result.creditProviderTransactionId,
      }).catch((e) => console.warn("easetag transfer notify:", e))
      return NextResponse.json({
        ok: true,
        idempotent: result.idempotent,
        transfer_group_id: result.transferGroupId,
        debit_provider_transaction_id: result.debitProviderTransactionId,
        credit_provider_transaction_id: result.creditProviderTransactionId,
        easner_transaction_id: result.easnerTransactionId,
      })
    }
  }

  const result = await executeEasetagTransfer(admin, {
    idempotencyKey,
    amount: ledgerAmount,
    currency: currencyRaw as "USD" | "EUR",
    senderUserId,
    senderBusinessId,
    payeeUserId: payeeUserId!,
    payeeBusinessId: payeeBusinessId ?? null,
    payeeEasetag: payeeEasetagResolved,
    senderEasetag: senderEasetag || undefined,
    reservedDebitEtid: reservedDebit || undefined,
    sendNote: sendNote || undefined,
  })

  if (!result.ok) {
    if (chainSettle) {
      await updateEasetagSettlementFailed(admin, transferGroupId, result.error).catch(() => {})
    }
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  }

  if (chainSettle && payeeAta) {
    const amt = ledgerAmount
    const asset = assetForEasetagCurrency(currencyRaw as "USD" | "EUR")
    await updateEasetagSettlementLedgerPtids(
      admin,
      transferGroupId,
      result.debitProviderTransactionId,
      result.creditProviderTransactionId,
    ).catch((e) => console.warn("easetag settlement ptids:", e))

    try {
      const send = await createTurnkeySend(admin, {
        ctx: acc.ctx,
        asset,
        chain: "solana",
        destinationAddress: payeeAta,
        destinationIsTokenAccount: true,
        destinationTokenAccountOwner: payeeVault ?? undefined,
        amount: amt,
        easetagSettlement: { transferGroupId },
      })
      await updateEasetagSettlementSubmitted(admin, transferGroupId, send.providerTransactionId, send.txHash)
      if (send.status === "failed") {
        const detail =
          send.chainFailureDetail?.trim() ||
          "Turnkey Solana broadcast failed (check gas sponsorship, rent sponsorship, and wallet USDC on-chain balance)."
        const rollbackSnapshot = await fetchEasetagDebitSnapshot(admin, result.transferGroupId)
        await rollbackEasetagP2pLedger(admin, {
          transferGroupId: result.transferGroupId,
          amount: amt,
          currency: currencyRaw as "USD" | "EUR",
          senderUserId,
          senderBusinessId,
          payeeUserId: payeeUserId!,
          payeeBusinessId: payeeBusinessId ?? null,
        })
        if (rollbackSnapshot) {
          await notifyEasetagTransferFailed(admin, {
            userId: senderUserId,
            snapshot: rollbackSnapshot,
            failureReason: detail,
          })
        }
        await updateEasetagSettlementFailed(admin, transferGroupId, detail).catch(() => {})
        return NextResponse.json({ ok: false, error: "turnkey_chain_settlement_failed", detail }, { status: 502 })
      }
      if (send.status === "settled") {
        await updateEasetagSettlementSettled(admin, transferGroupId, send.txHash)
      } else if (send.subOrgId) {
        const rec = await reconcileTurnkeySendStatus(admin, {
          subOrgId: send.subOrgId,
          providerTransactionId: send.providerTransactionId,
        })
        if (rec.status === "settled") {
          await updateEasetagSettlementSettled(admin, transferGroupId, rec.txHash)
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const rollbackSnapshot = await fetchEasetagDebitSnapshot(admin, result.transferGroupId)
      await rollbackEasetagP2pLedger(admin, {
        transferGroupId: result.transferGroupId,
        amount: amt,
        currency: currencyRaw as "USD" | "EUR",
        senderUserId,
        senderBusinessId,
        payeeUserId: payeeUserId!,
        payeeBusinessId: payeeBusinessId ?? null,
      })
      if (rollbackSnapshot) {
        await notifyEasetagTransferFailed(admin, {
          userId: senderUserId,
          snapshot: rollbackSnapshot,
          failureReason: msg || "Easetag transfer could not be completed.",
        })
      }
      await updateEasetagSettlementFailed(admin, transferGroupId, msg).catch(() => {})
      return NextResponse.json({ ok: false, error: msg || "turnkey_settlement_failed" }, { status: 400 })
    }
  }

  await notifyEasetagTransferSettled(admin, {
    idempotent: result.idempotent,
    debitProviderTransactionId: result.debitProviderTransactionId,
    creditProviderTransactionId: result.creditProviderTransactionId,
  }).catch((e) => console.warn("easetag transfer notify:", e))

  return NextResponse.json({
    ok: true,
    idempotent: result.idempotent,
    transfer_group_id: result.transferGroupId,
    debit_provider_transaction_id: result.debitProviderTransactionId,
    credit_provider_transaction_id: result.creditProviderTransactionId,
    easner_transaction_id: result.easnerTransactionId,
  })
}
