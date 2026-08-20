/**
 * Live Noah prepare + Easner pricing across all enabled payout corridors.
 * Send-entry: $100 / $500 / $1,000 / $5,000 from USD and EUR balance.
 *
 *   cd business && node --env-file=.env.local --import tsx scripts/probe-all-payout-economics.ts
 *
 * Env:
 *   PROBE_USER_ID, PROBE_NOAH_CUSTOMER_ID
 *   PROBE_OUTPUT – optional JSON path (default: docs/payout-economics-probe.json)
 *   PROBE_SEND_BUDGETS – comma amounts (default: 100,500,1000,5000)
 *   PROBE_SOURCES – USD,EUR (default both)
 *   PROBE_USE_USER_RECIPIENTS – 1 to prefer saved recipients (default: 1)
 */

import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { computeDisplayProcessingFee } from "@easner/shared"
import { buildPayoutQuote } from "@/lib/noah/payout-quote"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import { normalizeGlobalPayoutQuoteReceiveAmount } from "@easner/shared"
import { findNoahRate, listNoahRates } from "@/lib/fx/noah-rates"
import { normalizePayoutReceiveAmountForCurrency } from "@easner/shared"
import { NoahHttpError } from "@/lib/noah/http"
import {
  mapNoahPayoutUserError,
  parseNoahChannelLimitHints,
  type NoahChannelLimitHints,
} from "@/lib/noah/noah-prepare-errors"

const DEFAULT_USER_ID = "c7ace38e-be38-43e7-86e1-6e66b90d4243"
const DEFAULT_NOAH_CUSTOMER_ID = "eind_c7ace38ebe3843e786e16e66b90d4243"

/** Noah-accepted probe recipients (synthetic – prepare only, no execute). */
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
  GBP: {
    country_code: "GB",
    full_name: "Probe User",
    account_number: "12345678",
    sort_code: "040004",
    bank_name: "Monzo Bank",
    currency: "GBP",
  },
  CAD: {
    country_code: "CA",
    full_name: "Probe User",
    account_number: "1234567",
    routing_number: "000300002",
    sort_code: "00001",
    bank_name: "Royal Bank of Canada",
    currency: "CAD",
    address_line1: "123 Main St",
    city: "Toronto",
    state: "ON",
    postal_code: "M5H2N2",
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

type ProbeRow = {
  sourceBalance: "USD" | "EUR"
  sendBudget: number
  destCurrency: string
  destCountry: string
  recipientId?: string
  recipientSource?: "user" | "fixture"
  bankName?: string
  ok: boolean
  error?: string
  userError?: string
  channelLimitHints?: NoahChannelLimitHints
  receiveAmount?: number
  sending?: number
  processingFeeUI?: number
  processingFee1pct?: number
  displayChannelCost?: number
  totalDebited?: number
  noahFloor?: number
  marginAmount?: number
  footingOk?: boolean
  customerRate?: number
  effectiveRate?: number
}

type ResolvedProbeRecipient = {
  row: RecipientSellPrepareRow
  recipientId?: string
  recipientSource: "user" | "fixture"
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

function resolveProbeRecipient(
  destCurrency: string,
  userRecipients: Record<string, unknown>[] | null | undefined,
  preferUser: boolean,
): ResolvedProbeRecipient | null {
  const fixture = FIXTURE_RECIPIENTS[destCurrency]
  if (preferUser && userRecipients?.length) {
    const match = userRecipients.find(
      (r) => String(r.currency || "").trim().toUpperCase() === destCurrency,
    )
    if (match) {
      return {
        row: rowFromDbRecipient(match),
        recipientId: String(match.id || "").trim() || undefined,
        recipientSource: "user",
      }
    }
  }
  if (!fixture) return null
  return { row: fixture, recipientSource: "fixture" }
}

function probeRowBase(
  resolved: ResolvedProbeRecipient,
  sourceBalance: "USD" | "EUR",
  sendBudget: number,
  destCurrency: string,
): Pick<
  ProbeRow,
  "sourceBalance" | "sendBudget" | "destCurrency" | "destCountry" | "recipientId" | "recipientSource" | "bankName"
> {
  return {
    sourceBalance,
    sendBudget,
    destCurrency,
    destCountry: String(resolved.row.country_code || ""),
    recipientId: resolved.recipientId,
    recipientSource: resolved.recipientSource,
    bankName: resolved.row.bank_name?.trim() || undefined,
  }
}

function parseList(raw: string | undefined, fallback: string[]): string[] {
  const v = String(raw ?? "").trim()
  if (!v) return fallback
  return v.split(",").map((s) => s.trim()).filter(Boolean)
}

function round(n: number, d = 4): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 10 ** d) / 10 ** d
}

async function main() {
  const userId = process.env.PROBE_USER_ID?.trim() || DEFAULT_USER_ID
  const noahCustomerId = process.env.PROBE_NOAH_CUSTOMER_ID?.trim() || DEFAULT_NOAH_CUSTOMER_ID
  const sendBudgets = parseList(process.env.PROBE_SEND_BUDGETS, ["100", "500", "1000", "5000"]).map(
    Number,
  )
  const sources = parseList(process.env.PROBE_SOURCES, ["USD", "EUR"]).map((s) =>
    s.toUpperCase(),
  ) as Array<"USD" | "EUR">

  const admin = createSupabaseAdmin()
  const { data: corridors, error: cErr } = await admin
    .from("payout_corridors")
    .select("country_code, currency_code, rail, enabled")
    .eq("enabled", true)
    .order("currency_code")
  if (cErr) throw new Error(cErr.message)

  const destCurrencies = [
    ...new Set((corridors ?? []).map((c) => String(c.currency_code).toUpperCase())),
  ].sort()

  const { data: userRecipients } = await admin
    .from("recipients")
    .select("*")
    .eq("user_id", userId)

  const preferUserRecipients = useUserRecipientsEnv()
  const results: ProbeRow[] = []
  const errors: string[] = []
  const recipientSources: Record<string, "user" | "fixture" | "missing"> = {}

  for (const sourceBalance of sources) {
    if (sourceBalance !== "USD" && sourceBalance !== "EUR") continue

    const dbRates = await listNoahRates(admin, { status: "active" })

    for (const destCurrency of destCurrencies) {
      const resolved = resolveProbeRecipient(destCurrency, userRecipients ?? [], preferUserRecipients)
      if (!resolved) {
        errors.push(`no_fixture:${destCurrency}`)
        recipientSources[destCurrency] = "missing"
        continue
      }
      recipientSources[destCurrency] = resolved.recipientSource
      const fixture = resolved.row

      const dbRow =
        destCurrency === sourceBalance
          ? null
          : findNoahRate(dbRates, sourceBalance, destCurrency)

      if (destCurrency !== sourceBalance && !dbRow) {
        errors.push(`no_rate:${sourceBalance}->${destCurrency}`)
        continue
      }

      const customerRate = destCurrency === sourceBalance ? 1 : dbRow!.rate

      for (const sendBudget of sendBudgets) {
        if (!Number.isFinite(sendBudget) || sendBudget <= 0) continue

        let receiveFiatAmount: number
        try {
          receiveFiatAmount = normalizeGlobalPayoutQuoteReceiveAmount({
            amountEntryMode: "send",
            receiveFiatAmount: 0,
            sendBudget,
            customerRate,
            receiveCurrency: destCurrency,
            normalizeReceive: normalizePayoutReceiveAmountForCurrency,
          })
        } catch (e) {
          results.push({
            ...probeRowBase(resolved, sourceBalance, sendBudget, destCurrency),
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          })
          continue
        }

        try {
          const q = await buildPayoutQuote({
            userId,
            noahCustomerId,
            ...(resolved.recipientId ? { recipientId: resolved.recipientId } : { recipient: fixture }),
            receiveFiatAmount,
            sourceBalanceCurrency: sourceBalance,
            amountEntryMode: "send",
            sendBudget,
            prepareOverrides: (() => {
              if (destCurrency === "IDR" || destCurrency === "CAD") {
                return { paymentPurpose: "Family Maintenance" }
              }
              if (destCurrency === "EUR" || destCurrency === "USD") {
                return { note: "Easner probe" }
              }
              if (destCurrency === "GBP") return { paymentPurpose: "Family Maintenance" }
              return undefined
            })(),
          })

          const displayProcessingFee = computeDisplayProcessingFee({
            processingFee: q.processingFee,
            exchangeFee: q.displayChannelCost,
          })
          const footingOk =
            Math.abs(q.customerPrincipal + displayProcessingFee - q.totalDebited) < 0.0001

          results.push({
            ...probeRowBase(resolved, sourceBalance, sendBudget, destCurrency),
            ok: true,
            receiveAmount: q.receiveAmount,
            sending: round(q.customerPrincipal),
            processingFeeUI: round(displayProcessingFee),
            processingFee1pct: round(q.processingFee),
            displayChannelCost: round(q.displayChannelCost),
            totalDebited: round(q.totalDebited),
            noahFloor: round(Number(q.noah.noahFloor)),
            marginAmount: round(q.marginAmount),
            footingOk,
            customerRate: q.noah.rate,
            effectiveRate: round(q.noah.effectiveRate ?? 0, 2),
          })
        } catch (e) {
          const channelLimitHints =
            e instanceof NoahHttpError ? parseNoahChannelLimitHints(e.body) : undefined
          const hasHints =
            channelLimitHints &&
            (channelLimitHints.min || channelLimitHints.max || channelLimitHints.currency)
          results.push({
            ...probeRowBase(resolved, sourceBalance, sendBudget, destCurrency),
            ok: false,
            error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
            userError: mapNoahPayoutUserError(e, "quote"),
            ...(hasHints ? { channelLimitHints } : {}),
          })
        }

        await new Promise((r) => setTimeout(r, 120))
      }
    }
  }

  const summary = {
    probedAt: new Date().toISOString(),
    userId,
    preferUserRecipients,
    recipientSources,
    destCurrencies,
    sendBudgets,
    sources,
    total: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    footingFailures: results.filter((r) => r.ok && r.footingOk === false).length,
    missingFixtures: errors,
    results,
  }

  const outPath =
    process.env.PROBE_OUTPUT?.trim() ||
    join(process.cwd(), "..", "docs", "payout-economics-probe.json")
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(summary, null, 2))

  console.log(
    JSON.stringify(
      {
        outPath,
        total: summary.total,
        ok: summary.ok,
        failed: summary.failed,
        footingFailures: summary.footingFailures,
        destCurrencies,
        missingFixtures: errors,
        sampleOk: results.filter((r) => r.ok).slice(0, 3),
        sampleFail: results.filter((r) => !r.ok).slice(0, 5),
      },
      null,
      2,
    ),
  )
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
