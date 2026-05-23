/**
 * Tag existing bank pay-in rows as verification deposits when they match Noah microdeposit rules.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-verification-deposit-kind.ts
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-verification-deposit-kind.ts --dry-run
 */
import {
  buildVerificationDepositMetadataFields,
  classifyVerificationDeposit,
} from "../../packages/shared/src/transactions/verification-deposit"
import { createSupabaseAdmin } from "../lib/supabase/admin"

const dryRun = process.argv.includes("--dry-run")

function isNoahBankOnrampFiatPayIn(tx: Record<string, unknown>): boolean {
  if (String(tx.Direction ?? "") !== "In") return false
  if (String(tx.Network ?? "") !== "OffNetwork") return false
  return !!tx.FiatPayment
}

function readFiatAmount(meta: Record<string, unknown>, payload: Record<string, unknown>): number {
  if (typeof meta.fiat_deposit_amount === "number" && Number.isFinite(meta.fiat_deposit_amount)) {
    return meta.fiat_deposit_amount
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

async function main() {
  const admin = createSupabaseAdmin()
  const { data: rows, error } = await admin
    .from("transactions")
    .select("id, metadata, payload")
    .eq("provider", "noah")
    .eq("direction", "in")
    .filter("metadata->>flow", "eq", "bank_onramp")

  if (error) {
    console.error(error.message)
    process.exit(1)
  }

  let updated = 0
  let scanned = 0

  for (const row of rows ?? []) {
    scanned++
    const meta = (row.metadata as Record<string, unknown>) ?? {}
    const payload = row.payload as Record<string, unknown> | null | undefined
    if (!payload || !isNoahBankOnrampFiatPayIn(payload)) continue

    const fiatAmount = readFiatAmount(meta, payload)
    const settledStablecoinAmount =
      typeof meta.settled_amount === "number" && Number.isFinite(meta.settled_amount)
        ? meta.settled_amount
        : readSettledStablecoinAmount(payload)

    if (
      classifyVerificationDeposit({
        metadata: meta,
        payload,
        fiatAmount,
        settledStablecoinAmount,
      }) !== "verification"
    ) {
      continue
    }

    const fields = buildVerificationDepositMetadataFields({
      payload,
      metadata: meta,
      fiatAmount,
      settledStablecoinAmount,
      fiatDepositSenderName:
        typeof meta.noah_fiat_deposit_sender_name === "string"
          ? meta.noah_fiat_deposit_sender_name
          : null,
    })

    if (meta.deposit_kind === "verification" && meta.verification_bank_name === fields.verification_bank_name) {
      continue
    }

    const merged = {
      ...meta,
      deposit_kind: fields.deposit_kind,
      verification_bank_name: fields.verification_bank_name,
    }

    if (dryRun) {
      console.log(`[dry-run] ${row.id} → verification (${fields.verification_bank_name})`)
    } else {
      const { error: upErr } = await admin
        .from("transactions")
        .update({ metadata: merged, updated_at: new Date().toISOString() })
        .eq("id", row.id)
      if (upErr) {
        console.error(`failed ${row.id}:`, upErr.message)
        continue
      }
    }
    updated++
  }

  console.log(`Scanned ${scanned} bank_onramp rows; ${dryRun ? "would update" : "updated"} ${updated}.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
