/**
 * Reconcile verification microdeposit ledger rows from Noah FiatDeposit webhooks.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-verification-deposit-kind.ts
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-verification-deposit-kind.ts --dry-run
 */
import {
  classifyVerificationDeposit,
  isVerificationDepositMetadata,
} from "@easner/shared/transactions/verification-deposit"
import {
  buildNoahVerificationFiatDepositLedgerMetadata,
  extractFiatDepositEnrichment,
} from "../lib/noah/bank-onramp-tx"
import { fetchFiatDepositWebhooksByDepositIds } from "../lib/noah/fiat-deposit-webhook-timestamps"
import { createSupabaseAdmin } from "../lib/supabase/admin"

const dryRun = process.argv.includes("--dry-run")

function readFiatAmount(meta: Record<string, unknown>, payload: Record<string, unknown>): number {
  if (typeof meta.fiat_deposit_amount === "number" && Number.isFinite(meta.fiat_deposit_amount)) {
    return meta.fiat_deposit_amount
  }
  if (payload.FiatAmount != null) {
    const n = Number.parseFloat(String(payload.FiatAmount))
    if (Number.isFinite(n)) return n
  }
  const fp = payload.FiatPayment as Record<string, unknown> | undefined
  const n = Number.parseFloat(String(fp?.Amount ?? "0"))
  return Number.isFinite(n) ? n : 0
}

function readSettledStablecoinAmount(payload: Record<string, unknown>): number | null {
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

function isVerificationPayInRow(
  meta: Record<string, unknown>,
  payload: Record<string, unknown>,
): boolean {
  if (isVerificationDepositMetadata(meta)) return true
  const fiatAmount = readFiatAmount(meta, payload)
  const settledStablecoinAmount =
    typeof meta.settled_amount === "number" && Number.isFinite(meta.settled_amount)
      ? meta.settled_amount
      : readSettledStablecoinAmount(payload)
  return (
    classifyVerificationDeposit({
      metadata: meta,
      payload,
      fiatAmount,
      settledStablecoinAmount,
    }) === "verification"
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
    .filter("metadata->>flow", "eq", "bank_onramp")

  if (error) {
    console.error(error.message)
    process.exit(1)
  }

  const verificationRows = (rows ?? []).filter((row) => {
    const meta = (row.metadata as Record<string, unknown>) ?? {}
    const payload = (row.payload as Record<string, unknown> | null | undefined) ?? {}
    if (!payload || typeof payload !== "object") return false
    return isVerificationPayInRow(meta, payload)
  })

  const depositIds = verificationRows
    .map((r) => String(r.provider_transaction_id ?? "").trim())
    .filter(Boolean)

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
  const scanned = verificationRows.length

  for (const row of verificationRows) {
    const depositId = String(row.provider_transaction_id ?? "").trim()
    const webhook = webhookByDeposit.get(depositId)
    const stored = fiatDepositDataById.get(depositId)
    const fiatDepositData = stored?.data ?? null
    const occurred = webhook?.completedAt ?? stored?.occurred ?? null

    if (!fiatDepositData) {
      console.warn(`skip ${row.id}: no FiatDeposit webhook for ${depositId}`)
      continue
    }

    const enrichment = extractFiatDepositEnrichment(fiatDepositData)
    if (!enrichment) continue

    const metadata = buildNoahVerificationFiatDepositLedgerMetadata(fiatDepositData, enrichment, {
      occurredAt: webhook?.processingAt ?? enrichment.processingAt,
      completedAt: webhook?.completedAt ?? occurred,
    })

    const patch = {
      status: "settled",
      amount: enrichment.fiatAmount,
      currency: enrichment.fiatCurrency,
      payload: fiatDepositData,
      metadata,
      settled_at: webhook?.completedAt ?? occurred ?? row.settled_at,
      occurred_at: enrichment.processingAt ?? row.occurred_at,
      updated_at: new Date().toISOString(),
    }

    if (dryRun) {
      console.log(
        `[dry-run] ${row.id} (${depositId}) → FiatDeposit-first settled, bank=${metadata.verification_bank_name}`,
      )
    } else {
      const { error: upErr } = await admin.from("transactions").update(patch).eq("id", row.id)
      if (upErr) {
        console.error(`failed ${row.id}:`, upErr.message)
        continue
      }
    }
    updated++
  }

  console.log(
    `Scanned ${scanned} verification bank_onramp rows; ${dryRun ? "would update" : "updated"} ${updated}.`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
