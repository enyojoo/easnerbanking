/**
 * Binary-search max receive amount per corridor where Noah prepare succeeds.
 *
 *   cd business && node --env-file=.env.local --import tsx scripts/probe-corridor-prepare-limits.ts
 *   cd business && node --env-file=.env.local --import tsx scripts/probe-corridor-prepare-limits.ts --write-db
 *
 * Env: PROBE_USER_ID, PROBE_NOAH_CUSTOMER_ID, PROBE_OUTPUT, PROBE_USE_USER_RECIPIENTS
 */

import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { buildPayoutQuote } from "@/lib/noah/payout-quote"
import { findNoahRate, listNoahRates } from "@/lib/fx/noah-rates"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import { normalizePayoutReceiveAmountForCurrency } from "@easner/shared"

const DEFAULT_USER_ID = "c7ace38e-be38-43e7-86e1-6e66b90d4243"
const DEFAULT_NOAH_CUSTOMER_ID = "eind_c7ace38ebe3843e786e16e66b90d4243"

const FIXTURE_RECIPIENTS: Record<string, RecipientSellPrepareRow> = {
  NGN: {
    country_code: "NG",
    full_name: "Probe User",
    account_number: "0215258989",
    bank_name: "Guaranty Trust Bank (GTBank)",
    currency: "NGN",
  },
  KES: {
    country_code: "KE",
    full_name: "Probe User",
    account_number: "1234567890",
    bank_name: "Equity Bank",
    phone_number: "+254712345678",
    currency: "KES",
  },
  GHS: {
    country_code: "GH",
    full_name: "Probe User",
    account_number: "1234567890",
    bank_name: "GCB Bank",
    currency: "GHS",
  },
  ZAR: {
    country_code: "ZA",
    full_name: "Probe User",
    account_number: "1234567890",
    bank_name: "Standard Bank",
    currency: "ZAR",
  },
  RWF: {
    country_code: "RW",
    full_name: "Probe User",
    account_number: "1234567890",
    bank_name: "Bank of Kigali",
    currency: "RWF",
  },
  USD: {
    country_code: "US",
    full_name: "Probe User",
    account_number: "123456789",
    routing_number: "021000021",
    bank_name: "Chase Bank",
    currency: "USD",
    transfer_type: "ACH",
    checking_or_savings: "checking",
    address_line1: "123 Main St",
    city: "New York",
    state: "NY",
    postal_code: "10001",
  },
  EUR: {
    country_code: "DE",
    full_name: "Probe User",
    iban: "DE89370400440532013000",
    account_number: "532013000",
    bank_name: "Commerzbank",
    currency: "EUR",
  },
  IDR: {
    country_code: "ID",
    full_name: "Probe User",
    account_number: "1234567890",
    bank_name: "Bank Mandiri",
    swift_bic: "BMRIIDJA",
    phone_number: "+6281234567890",
    currency: "IDR",
  },
}

type LimitRow = {
  country: string
  currency: string
  rail: string
  recipientSource: "user" | "fixture"
  maxReceive: number | null
  maxSendUsd: number | null
  schemaMaxBefore: string | null
  schemaMaxAfter: string | null
  error?: string
}

function useUserRecipientsEnv(): boolean {
  const raw = process.env.PROBE_USE_USER_RECIPIENTS?.trim().toLowerCase()
  if (raw === "0" || raw === "false" || raw === "no") return false
  return true
}

function rowFromDbRecipient(rec: Record<string, unknown>): RecipientSellPrepareRow {
  return {
    country_code: rec.country_code as string | null | undefined,
    full_name: String(rec.full_name || ""),
    account_number: String(rec.account_number || rec.iban || ""),
    bank_name: String(rec.bank_name || ""),
    phone_number: rec.phone_number as string | null | undefined,
    currency: String(rec.currency || ""),
    routing_number: rec.routing_number as string | null | undefined,
    iban: rec.iban as string | null | undefined,
    transfer_type: rec.transfer_type as "ACH" | "Wire" | null | undefined,
    checking_or_savings: rec.checking_or_savings as "checking" | "savings" | null | undefined,
    address_line1: rec.address_line1 as string | null | undefined,
    city: rec.city as string | null | undefined,
    state: rec.state as string | null | undefined,
    postal_code: rec.postal_code as string | null | undefined,
    mobile_provider: rec.mobile_provider as string | null | undefined,
    sort_code: rec.sort_code as string | null | undefined,
    swift_bic: rec.swift_bic as string | null | undefined,
    email: rec.email as string | null | undefined,
  }
}

async function prepareOk(input: {
  userId: string
  noahCustomerId: string
  recipient: RecipientSellPrepareRow
  recipientId?: string
  receiveAmount: number
  sourceBalance: "USD" | "EUR"
}): Promise<boolean> {
  try {
    await buildPayoutQuote({
      userId: input.userId,
      noahCustomerId: input.noahCustomerId,
      ...(input.recipientId ? { recipientId: input.recipientId } : { recipient: input.recipient }),
      receiveFiatAmount: input.receiveAmount,
      sourceBalanceCurrency: input.sourceBalance,
      amountEntryMode: "receive",
      prepareOverrides:
        input.recipient.currency === "IDR"
          ? { paymentPurpose: "Family Maintenance" }
          : input.recipient.currency === "USD" || input.recipient.currency === "EUR"
            ? { note: "Easner probe" }
            : undefined,
    })
    return true
  } catch {
    return false
  }
}

async function findMaxReceive(input: {
  userId: string
  noahCustomerId: string
  recipient: RecipientSellPrepareRow
  recipientId?: string
  currency: string
  sourceBalance: "USD" | "EUR"
  ceiling: number
}): Promise<number | null> {
  const probe = async (amount: number) =>
    prepareOk({
      userId: input.userId,
      noahCustomerId: input.noahCustomerId,
      recipient: input.recipient,
      recipientId: input.recipientId,
      receiveAmount: normalizePayoutReceiveAmountForCurrency(input.currency, amount),
      sourceBalance: input.sourceBalance,
    })

  const minProbe = await probe(100)
  if (!minProbe) return null

  let lo = 100
  let hi = input.ceiling
  let best = lo

  if (!(await probe(hi))) {
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2)
      if (await probe(mid)) {
        lo = mid
        best = mid
      } else {
        hi = mid
      }
    }
    return best
  }

  return hi
}

async function main() {
  const writeDb = process.argv.includes("--write-db")
  const userId = process.env.PROBE_USER_ID?.trim() || DEFAULT_USER_ID
  const noahCustomerId = process.env.PROBE_NOAH_CUSTOMER_ID?.trim() || DEFAULT_NOAH_CUSTOMER_ID
  const preferUser = useUserRecipientsEnv()
  const admin = createSupabaseAdmin()

  const { data: corridors, error: cErr } = await admin
    .from("payout_corridors")
    .select("id, country_code, currency_code, rail, fields_schema")
    .eq("enabled", true)
    .order("currency_code")
  if (cErr) throw new Error(cErr.message)

  const { data: userRecipients } = await admin
    .from("recipients")
    .select("*")
    .eq("user_id", userId)

  const dbRates = await listNoahRates(admin, { status: "active" })
  const results: LimitRow[] = []

  for (const corridor of corridors ?? []) {
    const currency = String(corridor.currency_code).toUpperCase()
    const country = String(corridor.country_code).toUpperCase()
    const rail = String(corridor.rail || "bank_transfer")
    const schema = (corridor.fields_schema as Record<string, unknown> | null) ?? {}
    const limits = (schema.limits as { min?: string; max?: string } | null) ?? {}
    const schemaMaxBefore = limits.max != null ? String(limits.max) : null
    const ceiling = schemaMaxBefore
      ? Math.max(Number.parseFloat(schemaMaxBefore), 1_000_000)
      : 10_000_000

    const userMatch = preferUser
      ? (userRecipients ?? []).find(
          (r) => String(r.currency || "").trim().toUpperCase() === currency,
        )
      : null
    const fixture = FIXTURE_RECIPIENTS[currency]
    if (!userMatch && !fixture) {
      results.push({
        country,
        currency,
        rail,
        recipientSource: "fixture",
        maxReceive: null,
        maxSendUsd: null,
        schemaMaxBefore,
        schemaMaxAfter: schemaMaxBefore,
        error: "no_recipient",
      })
      continue
    }

    const recipient = userMatch ? rowFromDbRecipient(userMatch) : fixture!
    const recipientId = userMatch ? String(userMatch.id) : undefined
    const sourceBalance: "USD" | "EUR" = currency === "EUR" ? "EUR" : "USD"
    const rateRow =
      currency === sourceBalance ? null : findNoahRate(dbRates, sourceBalance, currency)
    const customerRate = currency === sourceBalance ? 1 : rateRow?.rate ?? 0

    let maxReceive: number | null = null
    let error: string | undefined
    try {
      maxReceive = await findMaxReceive({
        userId,
        noahCustomerId,
        recipient,
        recipientId,
        currency,
        sourceBalance,
        ceiling,
      })
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }

    const maxSendUsd =
      maxReceive != null && customerRate > 0
        ? Math.round((maxReceive / customerRate) * 100) / 100
        : null

    let schemaMaxAfter = schemaMaxBefore
    if (
      writeDb &&
      maxReceive != null &&
      corridor.id &&
      (!schemaMaxBefore || maxReceive < Number.parseFloat(schemaMaxBefore))
    ) {
      const nextSchema = {
        ...schema,
        limits: {
          ...(limits.min ? { min: limits.min } : {}),
          max: String(Math.floor(maxReceive)),
        },
      }
      const { error: upErr } = await admin
        .from("payout_corridors")
        .update({ fields_schema: nextSchema, updated_at: new Date().toISOString() })
        .eq("id", corridor.id)
      if (upErr) throw new Error(upErr.message)
      schemaMaxAfter = String(Math.floor(maxReceive))
    }

    results.push({
      country,
      currency,
      rail,
      recipientSource: userMatch ? "user" : "fixture",
      maxReceive,
      maxSendUsd,
      schemaMaxBefore,
      schemaMaxAfter,
      ...(error ? { error } : {}),
    })

    await new Promise((r) => setTimeout(r, 200))
  }

  const summary = {
    probedAt: new Date().toISOString(),
    userId,
    writeDb,
    results,
  }

  const outPath =
    process.env.PROBE_OUTPUT?.trim() ||
    join(process.cwd(), "..", "docs", "corridor-prepare-limits.json")
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(summary, null, 2))
  console.log(JSON.stringify({ outPath, count: results.length, writeDb }, null, 2))
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
