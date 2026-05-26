/**
 * Reconcile funding VA bank pay-in ledger rows: rebuild metadata from Transaction payload
 * plus FiatDeposit webhooks (sender, narration, lifecycle timestamps).
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-bank-deposit-pay-in.ts --dry-run
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-bank-deposit-pay-in.ts
 */
import {
  classifyVerificationDeposit,
  isVerificationDepositMetadata,
} from "@easner/shared/transactions/verification-deposit"
import {
  buildNoahBankPayInLedgerMetadata,
  extractFiatDepositEnrichment,
  extractNoahBankPayInEnrichment,
  isNoahBankOnrampFiatPayIn,
  isNoahFiatDepositWebhookPayload,
  mergePayInMetadataWithLifecycle,
} from "../lib/noah/bank-onramp-tx"
import { fetchFiatDepositWebhooksByDepositIds } from "../lib/noah/fiat-deposit-webhook-timestamps"
import { createSupabaseAdmin } from "../lib/supabase/admin"

const dryRun = process.argv.includes("--dry-run")

function readFiatAmount(meta: Record<string, unknown>, payload: Record<string, unknown>): number {
  if (typeof meta.fiat_deposit_amount === "number" && Number.isFinite(meta.fiat_deposit_amount)) {
    return meta.fiat_deposit_amount
  }
  const fp = payload.FiatPayment as Record<string, unknown> | undefined
  const n = Number.parseFloat(String(fp?.Amount ?? payload.FiatAmount ?? "0"))
  return Number.isFinite(n) ? n : 0
}

function readSettledStablecoinAmount(
  meta: Record<string, unknown>,
  payload: Record<string, unknown>,
): number | null {
  if (typeof meta.settled_amount === "number" && Number.isFinite(meta.settled_amount)) {
    return meta.settled_amount
  }
  const items = payload.Breakdown
  if (Array.isArray(items)) {
    for (const item of items) {
      if (!item || typeof item !== "object") continue
      const row = item as Record<string, unknown>
      if (String(row.Type ?? "") !== "Remaining") continue
      const n = Number.parseFloat(String(row.Amount ?? ""))
      if (Number.isFinite(n)) return n
    }
  }
  const cryptoAmount = Number.parseFloat(String(payload.Amount ?? ""))
  return Number.isFinite(cryptoAmount) ? cryptoAmount : null
}

function pickDepositId(
  payload: Record<string, unknown>,
  meta: Record<string, unknown>,
  enrichment: ReturnType<typeof extractNoahBankPayInEnrichment>,
): string {
  const fp = payload.FiatPayment as Record<string, unknown> | undefined
  const fromFp = fp?.FiatDepositID != null ? String(fp.FiatDepositID).trim() : ""
  if (fromFp) return fromFp
  if (enrichment?.ruleExecutionId) return enrichment.ruleExecutionId
  const fromMeta = meta.noah_fiat_deposit_id ?? meta.noah_rule_execution_id
  if (fromMeta != null && String(fromMeta).trim()) return String(fromMeta).trim()
  return ""
}

function isFundingPayInRow(meta: Record<string, unknown>, payload: Record<string, unknown>): boolean {
  if (meta.suppress_in_feed === true) return false
  if (meta.noah_orchestration_settlement_in_leg === true) return false
  const flow = String(meta.flow ?? "").toLowerCase()
  if (flow && flow !== "bank_onramp") return false
  if (isVerificationDepositMetadata(meta)) return false
  if (!isNoahBankOnrampFiatPayIn(payload)) return false
  if (isNoahFiatDepositWebhookPayload(payload)) return false
  const fiatAmount = readFiatAmount(meta, payload)
  const settledStablecoinAmount = readSettledStablecoinAmount(meta, payload)
  return (
    classifyVerificationDeposit({
      metadata: meta,
      payload,
      fiatAmount,
      settledStablecoinAmount,
    }) === "funding"
  )
}

async function main() {
  const admin = createSupabaseAdmin()
  const { data: rows, error } = await admin
    .from("transactions")
    .select(
      "id, provider_transaction_id, status, metadata, payload, occurred_at, settled_at, amount, currency",
    )
    .eq("provider", "noah")
    .eq("direction", "in")

  if (error) {
    console.error(error.message)
    process.exit(1)
  }

  const fundingRows = (rows ?? []).filter((row) => {
    const meta = (row.metadata as Record<string, unknown>) ?? {}
    const payload = (row.payload as Record<string, unknown> | null | undefined) ?? {}
    if (!payload || typeof payload !== "object") return false
    return isFundingPayInRow(meta, payload)
  })

  const depositIds = [
    ...new Set(
      fundingRows
        .map((row) => {
          const meta = (row.metadata as Record<string, unknown>) ?? {}
          const payload = row.payload as Record<string, unknown>
          const enrichment = extractNoahBankPayInEnrichment(payload)
          return pickDepositId(payload, meta, enrichment)
        })
        .filter(Boolean),
    ),
  ]

  const webhookByDeposit = await fetchFiatDepositWebhooksByDepositIds(admin, depositIds)
  const wantedDeposits = new Set(depositIds)

  const { data: inboxRows } = await admin
    .from("event_inbox")
    .select("payload, received_at")
    .eq("provider", "noah")
    .eq("event_type", "FiatDeposit")
    .order("received_at", { ascending: true })
    .limit(5000)

  const fiatDepositDataById = new Map<
    string,
    { data: Record<string, unknown>; occurred: string | null }
  >()
  for (const inbox of inboxRows ?? []) {
    const envelope = inbox.payload as Record<string, unknown> | undefined
    const d = envelope?.Data as Record<string, unknown> | undefined
    if (!d) continue
    const depositId = String(d.ID ?? "").trim()
    if (!wantedDeposits.has(depositId)) continue
    const occurred = String(envelope?.Occurred ?? d.Created ?? inbox.received_at ?? "")
    const prev = fiatDepositDataById.get(depositId)
    const isSettled = String(d.Status ?? "").toLowerCase() === "settled"
    if (!prev || isSettled) {
      fiatDepositDataById.set(depositId, { data: d, occurred })
    }
  }

  let updated = 0
  let skipped = 0
  const scanned = fundingRows.length

  for (const row of fundingRows) {
    const meta = (row.metadata as Record<string, unknown>) ?? {}
    const payload = row.payload as Record<string, unknown>
    const payInEnrichment = extractNoahBankPayInEnrichment(payload)
    if (!payInEnrichment) {
      skipped++
      continue
    }

    const depositId = pickDepositId(payload, meta, payInEnrichment)
    const webhook = depositId ? webhookByDeposit.get(depositId) : undefined
    const stored = depositId ? fiatDepositDataById.get(depositId) : undefined
    const fiatDepositData = stored?.data ?? null
    const fiatDepositEnrichment = fiatDepositData
      ? extractFiatDepositEnrichment(fiatDepositData)
      : null

    const fiatDepositSenderName =
      webhook?.senderName ??
      fiatDepositEnrichment?.senderDisplayName ??
      (typeof meta.noah_fiat_deposit_sender_name === "string"
        ? meta.noah_fiat_deposit_sender_name
        : null)

    const paymentReference =
      webhook?.paymentReference ??
      fiatDepositEnrichment?.paymentReference ??
      (typeof meta.payment_reference === "string" && meta.payment_reference.trim()
        ? meta.payment_reference
        : typeof meta.reference === "string" && meta.reference.trim()
          ? meta.reference
          : null)

    const status = String(row.status ?? payload.Status ?? "").toLowerCase() || "unknown"
    const payInMeta = buildNoahBankPayInLedgerMetadata(payload, payInEnrichment, {
      status,
      occurredAt: row.occurred_at != null ? String(row.occurred_at) : null,
      fiatDepositSenderName,
      paymentReference,
    })

    if (fiatDepositEnrichment?.paymentMethodType) {
      payInMeta.noah_payment_method_type = fiatDepositEnrichment.paymentMethodType
    } else if (webhook?.paymentMethodType) {
      payInMeta.noah_payment_method_type = webhook.paymentMethodType
    }

    const metadata = mergePayInMetadataWithLifecycle(meta, payInMeta, {
      processing_at:
        webhook?.processingAt ??
        fiatDepositEnrichment?.processingAt ??
        (meta.processing_at != null ? String(meta.processing_at) : null),
      completed_at:
        webhook?.completedAt ??
        (status === "settled" && row.settled_at != null ? String(row.settled_at) : null) ??
        (meta.completed_at != null ? String(meta.completed_at) : null),
      noah_fiat_deposit_id: depositId || fiatDepositEnrichment?.depositId || null,
    })

    const patch = {
      metadata,
      updated_at: new Date().toISOString(),
    }

    const senderLabel =
      typeof metadata.sender_name === "string" ? metadata.sender_name : "—"
    const narrationLabel =
      typeof metadata.deposit_narration === "string" ? metadata.deposit_narration : "—"

    if (dryRun) {
      console.log(
        `[dry-run] ${row.id} (${depositId || row.provider_transaction_id}) → sender=${senderLabel}, narration=${narrationLabel}`,
      )
    } else {
      const { error: upErr } = await admin.from("transactions").update(patch).eq("id", row.id)
      if (upErr) {
        console.error(`failed ${row.id}:`, upErr.message)
        skipped++
        continue
      }
    }
    updated++
  }

  console.log(
    `Scanned ${scanned} funding bank_onramp rows; ${dryRun ? "would update" : "updated"} ${updated}; skipped ${skipped}.`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
