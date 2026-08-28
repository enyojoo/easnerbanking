import { createClient } from "@supabase/supabase-js"
import { parseTurnkeyBalanceWebhookPayload } from "@/lib/turnkey/turnkey-balance-webhook-payload"
import { applyTurnkeyInboundLedgerEvent } from "@/lib/turnkey/apply-turnkey-inbound-ledger"
import { resolveTurnkeyWalletScopeFromEvent } from "@/lib/turnkey/resolve-turnkey-wallet-scope"
import { findGridVaTurnkeySweepForSolanaTx } from "@/lib/grid/va-turnkey-sweep"
import { findRelayDepositChainSettlementForSuppression } from "@/lib/relay-deposit/relay-deposit-suppression"
import { findEasetagSettlementForChainSuppression } from "@/lib/ledger/easetag-settlement"
import { tryMatchTurnkeyStripeSettlement } from "@/lib/turnkey/stripe-settlement-match"

const APPLY = process.argv.includes("--apply")
const positional = process.argv.slice(2).filter((a) => !a.startsWith("-"))
const HASH =
  positional[0] ??
  "37qYhGguuLc2Yc2243vJqNSfjSNo4XADMoKadbxgSM6ZZRXxYKYASfRKmysGz3dq6srxfMKJM3aAnNixAP1o8EQB"

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  const { data: inbox } = await admin
    .from("event_inbox")
    .select("payload,event_id")
    .eq("provider", "turnkey")
    .order("received_at", { ascending: false })
    .limit(30)

  const row = (inbox ?? []).find((r) => {
    const h = String(r.payload?.msg?.txHash ?? "")
    return h === HASH || h.startsWith(HASH.slice(0, 16))
  })
  if (!row) throw new Error("inbox row not found")

  const parsed = parseTurnkeyBalanceWebhookPayload(row.payload)
  if (parsed.kind !== "deposit") throw new Error(`not deposit: ${parsed.kind}`)

  const scope = await resolveTurnkeyWalletScopeFromEvent(admin, {
    ...parsed.data.raw,
    address: parsed.data.address,
    txHash: parsed.data.txHash,
    asset: parsed.data.asset,
    msg: parsed.data.raw.msg as Record<string, unknown>,
  })
  if (!scope) throw new Error("no wallet scope")

  const checks = {
    sweep: await findGridVaTurnkeySweepForSolanaTx(admin, {
      txHash: HASH,
      businessId: scope.businessId,
      userId: scope.userId,
      amount: parsed.data.amount,
    }),
    relay: await findRelayDepositChainSettlementForSuppression(admin, {
      txHash: HASH,
      userId: scope.userId,
      businessId: scope.businessId,
      inboundAmount: parsed.data.amount,
      recipientVaultAta: scope.tokenAccountAddress,
      asset: "USDC",
      chain: "solana",
    }),
    easetag: await findEasetagSettlementForChainSuppression(admin, {
      turnkeySendStatusId: HASH,
      txHash: HASH,
      payeeUserId: scope.userId,
      payeeBusinessId: scope.businessId,
      amount: parsed.data.amount,
      currency: "USD",
    }),
    stripe: await tryMatchTurnkeyStripeSettlement(admin, {
      businessId: scope.businessId,
      userId: scope.userId,
      amount: parsed.data.amount,
      currency: "USD",
      walletAddress: parsed.data.address,
    }),
  }
  console.log("CHECKS", JSON.stringify(checks, null, 2))

  if (!APPLY) {
    console.log("dry-run only; pass --apply to create ledger row")
    return
  }

  const result = await applyTurnkeyInboundLedgerEvent(admin, {
    userId: scope.userId,
    businessId: scope.businessId,
    walletAccount: {
      id: String(scope.walletAccount.id),
      address: scope.walletAddress,
      asset: "USDC",
      chain: "solana",
      associated_token_account_address: scope.tokenAccountAddress || null,
    },
    providerTransactionId: HASH,
    providerEventId: "replay-missing-deposit",
    status: "settled",
    amount: parsed.data.amount,
    currency: "USD",
    direction: "in",
    payload: parsed.data.raw,
    metadata: {
      source: "turnkey_balance_webhook",
      operation: "deposit",
      source_payment_rail: "solana",
      source_currency: "USDC",
    },
    txHash: HASH,
    walletAddress: scope.walletAddress,
    counterpartyAddress: null,
    occurredAt: parsed.data.occurredAt,
    settledAt: parsed.data.settledAt,
    asset: "USDC",
    chain: "solana",
    amountMinor: parsed.data.amountMinor,
  })
  console.log("RESULT", result)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
