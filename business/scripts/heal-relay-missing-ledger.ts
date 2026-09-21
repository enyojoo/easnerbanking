/**
 * Book the missing second Relay deposit (already in wallet) and the missing fee-wallet row.
 * Fix ETID36487508 occurred_at to the Tron time.
 *
 *   cd business && node --env-file=.env.local --import tsx scripts/heal-relay-missing-ledger.ts
 *   cd business && node --env-file=.env.local --import tsx scripts/heal-relay-missing-ledger.ts --apply
 */
import { createClient } from "@supabase/supabase-js"
import { generateTransactionId } from "@/lib/transaction-id"
import { ensureFeeWalletRevenueDeposit } from "@/lib/processing-fee/fee-wallet-inbound-deposit"
import { relayGetRequestV3 } from "@/lib/relay/client"
import {
  extractRelayOccurredAtV3,
  extractRelayOutTxHashesV3,
  parseRelayFeesV3,
  parseRelayRouteAmountsV3,
} from "@/lib/relay/requests-v3"

const APPLY = process.argv.includes("--apply")
const FIRST_REQUEST = "0x1790026525b3e6fc160ceecfac04b319163e1d188f79367c95ff1e7404d351ab"
const SECOND_REQUEST = "0x17900281902a6da8c43e754ce79c1856182d53741dd51fb7a908e864a351429b"
const TRON = "TBgQuFDCpVrxa1SorJBmGJ6pohX35TgA97"
const USER_ID = "cf9effa0-4244-4c8d-903f-afc29737ee74"
const FEE_HASH =
  "bVaaPyyfaP8HyynZBXapbcpUSWYSqUFQbJvky6mcMsWDnE9tM3BjAmoszYXg2JSoDRkYSbQuuyK223pRShK2sa1"

function roundMoney(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000
}

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  const firstReq = await relayGetRequestV3(FIRST_REQUEST)
  const firstOccurred = firstReq ? extractRelayOccurredAtV3(firstReq) : null
  const { data: firstTx } = await admin
    .from("transactions")
    .select("id, occurred_at, settled_at")
    .eq("easner_transaction_id", "ETID36487508")
    .maybeSingle()

  let firstPatched = false
  if (APPLY && firstTx?.id && firstOccurred && String(firstTx.occurred_at) !== firstOccurred) {
    const { error } = await admin
      .from("transactions")
      .update({
        occurred_at: firstOccurred,
        settled_at: firstOccurred,
        updated_at: new Date().toISOString(),
      })
      .eq("id", firstTx.id)
    if (error) throw error
    firstPatched = true
  }

  const secondReq = await relayGetRequestV3(SECOND_REQUEST)
  if (!secondReq) throw new Error("second_relay_request_not_found")
  const route = parseRelayRouteAmountsV3(secondReq)
  const fees = parseRelayFeesV3(secondReq)
  const outHash = extractRelayOutTxHashesV3(secondReq)[0] ?? ""
  const occurredAt = extractRelayOccurredAtV3(secondReq) || secondReq.createdAt || new Date().toISOString()
  const posted = roundMoney(Number(route.received ?? 0))
  const etid = generateTransactionId()

  const { data: existingSecond } = await admin
    .from("transactions")
    .select("easner_transaction_id")
    .eq("provider", "relay")
    .eq("provider_transaction_id", SECOND_REQUEST)
    .maybeSingle()

  const { data: ownerRow } = await admin
    .from("relay_deposits")
    .select("wallet_owner_id")
    .eq("tron_address", TRON)
    .limit(1)
    .maybeSingle()

  let second = { inserted: false, etid: existingSecond?.easner_transaction_id ?? null as string | null }
  if (APPLY && !existingSecond && posted > 0 && outHash) {
    const { data: inserted, error: txErr } = await admin
      .from("transactions")
      .insert({
        user_id: USER_ID,
        business_id: null,
        provider: "relay",
        provider_transaction_id: SECOND_REQUEST,
        status: "settled",
        amount: posted,
        currency: "USD",
        base_currency: "USD",
        base_amount: posted,
        direction: "in",
        occurred_at: occurredAt,
        settled_at: occurredAt,
        tx_hash: outHash,
        hidden_from_feed: false,
        easner_transaction_id: etid,
        asset: "USDC",
        chain: "Solana",
        counterparty_address: TRON,
        metadata: {
          activity_type: "relay_tron_deposit",
          source_type: "relay_tron_deposit",
          source_payment_rail: "tron",
          source_currency: "USDT",
          tron_address: TRON,
          gross_usdt: route.deposited,
          relay_fee: fees.actualUsd,
          on_chain_usdc: route.received,
          easner_deposit_fee: 0,
          fee_amount: roundMoney(Number(route.deposited ?? 0) - posted),
          posted_amount: posted,
          posted_currency: "USD",
          sender_tron_address: TRON,
          from_address: TRON,
          relay_request_id: SECOND_REQUEST,
          balance_delta_applied: true,
          heal_missing_relay_ledger: true,
        },
      })
      .select("id, easner_transaction_id")
      .single()
    if (txErr) throw txErr

    const { data: dep, error: depErr } = await admin
      .from("relay_deposits")
      .upsert(
        {
          wallet_owner_id: ownerRow?.wallet_owner_id,
          tron_address: TRON,
          relay_request_id: SECOND_REQUEST,
          gross_usdt: route.deposited,
          relay_fee: fees.actualUsd,
          on_chain_usdc: route.received,
          easner_deposit_fee: 0,
          posted_amount: posted,
          status: "settled",
          turnkey_tx_hash: outHash,
          ledger_tx_id: inserted.id,
          metadata: {
            sender_tron_address: TRON,
            relay_occurred_at: occurredAt,
            heal_missing_relay_ledger: true,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "relay_request_id" },
      )
      .select("id")
      .maybeSingle()
    if (depErr) throw depErr
    second = { inserted: true, etid: String(inserted.easner_transaction_id), depositId: dep?.id }
  }

  const { data: feePayout } = await admin
    .from("transactions")
    .select("user_id, business_id, metadata")
    .eq("easner_transaction_id", "ETID61723552")
    .maybeSingle()
  const feeMeta = (feePayout?.metadata || {}) as Record<string, unknown>
  const fee = APPLY
    ? await ensureFeeWalletRevenueDeposit(admin, {
        txHash: FEE_HASH,
        amount: Number(feeMeta.fee_wallet_sweep ?? 0.746757),
        senderUserId: feePayout?.user_id ? String(feePayout.user_id) : null,
        senderBusinessId: feePayout?.business_id ? String(feePayout.business_id) : null,
        relatedEasnerTransactionId: "ETID61723552",
      })
    : { inserted: false, existing: false }

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        firstOccurred,
        firstWas: firstTx?.occurred_at ?? null,
        firstPatched,
        secondPreview: { posted, outHash, occurredAt },
        second,
        fee,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
