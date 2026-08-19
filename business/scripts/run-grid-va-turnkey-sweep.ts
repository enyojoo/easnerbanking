/**
 * One-shot: move stranded Grid VA INTERNAL_FIAT USD to the business Turnkey Solana vault.
 *
 * Usage:
 *   cd business
 *   node --env-file=.env.local --import tsx scripts/run-grid-va-turnkey-sweep.ts
 */
import { createClient } from "@supabase/supabase-js"
import { GridHttpError } from "../lib/grid/http"
import { registerTurnkeyUsdcExternalAccount } from "../lib/grid/turnkey-external-account"
import { buildGridVaTurnkeySweepQuoteBody } from "../lib/grid/quote-request"
import { gridMinorUnits } from "../lib/grid/external-account"
import { gridFetch } from "../lib/grid/http"
import { buildGridIdempotencyKey } from "../lib/grid/idempotency"
import type { GridQuote } from "../lib/grid/types"
import { retrieveGridQuote } from "../lib/grid/quote-funding"
import { extractGridOnChainTxHash } from "../lib/grid/webhook-amount"

const BUSINESS_ID = "4769329d-a171-49cf-8647-7e9b8a0128d3"
const OWNER_USER_ID = "6e037c2b-0467-4528-8530-ead07fc24f24"
const CUSTOMER_ID = "Customer:01a008db-9fbc-938e-0000-a3e2e6585384"
const SOURCE_INTERNAL = "InternalAccount:01a00ff7-04aa-438c-0000-d33a59fcb8d4"

const INBOUNDS = [
  {
    label: "dashboard_bridge_building",
    inboundId: "Transaction:01a0182e-5134-da6a-0000-c276a5845dae",
    ledgerId: "6031f322-8a0f-4cbf-b4df-1312304f1d35",
    amount: 1,
  },
  {
    label: "connect_easner",
    inboundId: "Transaction:01a0182e-5173-da6a-0000-d7235d231cb8",
    ledgerId: "b27b7b76-0235-4291-a8cd-87c9104b2511",
    amount: 1,
  },
] as const

function errInfo(e: unknown) {
  if (e instanceof GridHttpError) {
    return { message: e.message, status: e.status, body: e.body, path: e.path }
  }
  return { message: e instanceof Error ? e.message : String(e) }
}

async function executeQuote(quoteId: string, inboundId: string) {
  try {
    await gridFetch({
      method: "POST",
      path: `/quotes/${encodeURIComponent(quoteId)}/execute`,
      idempotencyKey: buildGridIdempotencyKey(`grid_va_sweep_exec_${inboundId}`, { quoteId }),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : ""
    if (/already|executed|processing/i.test(message)) return
    if (e instanceof GridHttpError && (e.status === 409 || e.status === 400)) {
      const body = JSON.stringify(e.body ?? "").toLowerCase()
      if (body.includes("already") || body.includes("executed") || body.includes("processing")) return
    }
    throw e
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("supabase env missing")
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const eaId = await registerTurnkeyUsdcExternalAccount({
    admin,
    businessId: BUSINESS_ID,
    userId: OWNER_USER_ID,
    gridCustomerId: CUSTOMER_ID,
  })
  console.log(JSON.stringify({ step: "register_ea", eaId }, null, 2))
  if (!eaId) throw new Error("turnkey_external_account_missing")

  const results: Record<string, unknown>[] = []
  for (const inbound of INBOUNDS) {
    const quoteBody = buildGridVaTurnkeySweepQuoteBody({
      sourceInternalAccountId: SOURCE_INTERNAL,
      turnkeyExternalAccountId: eaId,
      lockedSendMinor: gridMinorUnits(inbound.amount, 2),
    })
    try {
      const quote = await gridFetch<GridQuote>({
        method: "POST",
        path: "/quotes",
        json: quoteBody,
        idempotencyKey: buildGridIdempotencyKey(`grid_va_sweep_${inbound.inboundId}`, quoteBody),
      })
      const quoteId = String(quote.id ?? "")
      const status = String(quote.status ?? "")
      if (quoteId && !/COMPLETED|SETTLED|EXECUTED|PROCESSING/i.test(status) && !/FAILED|EXPIRED/i.test(status)) {
        await executeQuote(quoteId, inbound.inboundId)
      }
      const after = quoteId ? await retrieveGridQuote(quoteId).catch(() => quote) : quote
      const hash = extractGridOnChainTxHash(after as unknown as Record<string, unknown>)
      if (hash && inbound.ledgerId) {
        await admin
          .from("transactions")
          .update({ tx_hash: hash, updated_at: new Date().toISOString() })
          .eq("id", inbound.ledgerId)
      }
      results.push({
        label: inbound.label,
        inboundId: inbound.inboundId,
        quoteId,
        status: after.status ?? status,
        transactionId: after.transactionId ?? quote.transactionId,
        hash,
      })
    } catch (e) {
      results.push({ label: inbound.label, inboundId: inbound.inboundId, error: errInfo(e) })
    }
  }

  const { data: dummy, error: dummyErr } = await admin
    .from("grid_transfers")
    .insert({
      user_id: OWNER_USER_ID,
      business_id: BUSINESS_ID,
      mode: "stripe_settlement",
      settlement_rail: "turnkey_stablecoin",
      status: "pending",
      expected_amount_cents: 100,
      receive_currency: "USD",
      destination_ref: "turnkey",
      invoice_settlement_ids: [],
      metadata: {
        source: "va_turnkey_sweep_heal",
        inbound_grid_transaction_id: INBOUNDS[1].inboundId,
      },
    })
    .select("id")
    .maybeSingle()

  console.log(
    JSON.stringify(
      {
        results,
        connectSuppressTransferId: dummy?.id ?? null,
        connectSuppressError: dummyErr?.message ?? null,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(JSON.stringify(errInfo(e), null, 2))
  process.exit(1)
})
